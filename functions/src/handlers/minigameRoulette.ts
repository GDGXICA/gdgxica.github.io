import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";

// POST /api/events/:slug/minigames/:id/roulette/spin
//
// Picks a random participant who hasn't won yet, records their win on the
// participant doc and updates the instance doc so all real-time listeners
// (projector, participant views) can react to the new spin immediately.
// Uses a transaction to keep spinCount and rouletteWonAt consistent.
export async function spin(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const db = admin.firestore();

    const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
    const instanceSnap = await instanceRef.get();
    if (!instanceSnap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Instancia no encontrada" });
      return;
    }
    const instance = instanceSnap.data() as
      { type?: string; state?: string; spinCount?: number } | undefined;
    if (instance?.type !== "roulette") {
      res
        .status(400)
        .json({ success: false, error: "No es una instancia de ruleta" });
      return;
    }
    if (instance?.state !== "live") {
      res.status(400).json({
        success: false,
        error: "La ruleta debe estar en vivo para girar",
      });
      return;
    }

    // Participantes que aún no han ganado.
    //
    // El filtro va en memoria, y no en un where("rouletteWonAt", "==", null),
    // porque los docs de participante los crea /join (minigameJoin.ts) con
    // solo {uid, alias, joinedAt}: el campo NO existe hasta que esta misma
    // función lo escribe sobre el ganador. Firestore iguala a null únicamente
    // el campo que existe y vale null, nunca el ausente, así que aquella
    // consulta no veía a nadie y la ruleta no giraba jamás — devolvía "No hay
    // participantes elegibles" con la sala llena.
    //
    // Filtrar en memoria, además de tratar ambas formas por igual, arregla a
    // los participantes ya apuntados sin rellenarles el campo. Es la
    // misma regla que ya aplicaba el cliente en useRouletteParticipants.ts,
    // que por eso pintaba elegibles y habilitaba el botón mientras el
    // servidor rechazaba el giro.
    const participantsCol = instanceRef.collection("participants");
    const now = FieldValue.serverTimestamp();

    // Leer participantes y sortear van DENTRO de la transacción. Elegir fuera
    // y escribir dentro parece equivalente y no lo es: dos giros simultáneos
    // —dos organizadores con el panel abierto, o el proyector y el panel; el
    // `disabled` del botón solo frena a un cliente— leían la misma lista y
    // podían sacar a la misma persona. Las dos transacciones chocan en
    // `instanceRef` y una reintenta, pero el ganador estaba calculado FUERA
    // del callback, así que el reintento repetía el mismo y solo le pisaba
    // `rouletteSpinNumber`: la misma persona premiada dos veces, otro
    // elegible saltado en silencio y `spinCount` llegando a 2. Sorteando
    // aquí, el reintento vuelve a leer y vuelve a sortear.
    const outcome = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(instanceRef);
      const participantsSnap = await tx.get(participantsCol);

      const eligible = participantsSnap.docs.filter((doc) => {
        const wonAt = (doc.data() as { rouletteWonAt?: unknown }).rouletteWonAt;
        return wonAt === null || wonAt === undefined;
      });
      if (eligible.length === 0) return null;

      const winner = eligible[Math.floor(Math.random() * eligible.length)];
      const spinCount =
        ((freshSnap.data() as { spinCount?: number })?.spinCount ?? 0) + 1;

      tx.update(instanceRef, {
        spinCount,
        lastSpinWinnerId: winner.id,
        lastSpinAt: now,
      });
      tx.update(participantsCol.doc(winner.id), {
        rouletteWonAt: now,
        rouletteSpinNumber: spinCount,
      });

      return {
        winnerId: winner.id,
        alias: (winner.data() as { alias?: string }).alias ?? "Anónimo",
        spinNumber: spinCount,
      };
    });

    if (!outcome) {
      res
        .status(400)
        .json({ success: false, error: "No hay participantes elegibles" });
      return;
    }

    await writeAuditLog(
      {
        action: "minigame_instance.roulette.spin",
        performedBy: user.uid,
        targetId: id,
        targetType: "minigame_instance",
        details: {
          slug,
          winnerId: outcome.winnerId,
          alias: outcome.alias,
          spinNumber: outcome.spinNumber,
        },
        timestamp: now,
      },
      req
    );

    res.json({ success: true, data: outcome });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

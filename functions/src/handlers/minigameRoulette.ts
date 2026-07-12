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

    // Load all participants who haven't won yet.
    const participantsCol = instanceRef.collection("participants");
    const eligibleSnap = await participantsCol
      .where("rouletteWonAt", "==", null)
      .get();

    if (eligibleSnap.empty) {
      res
        .status(400)
        .json({ success: false, error: "No hay participantes elegibles" });
      return;
    }

    const eligible = eligibleSnap.docs;
    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    const winnerData = winner.data() as { alias?: string };
    const alias = winnerData.alias ?? "Anónimo";
    const now = FieldValue.serverTimestamp();

    const spinNumber = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(instanceRef);
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

      return spinCount;
    });

    await writeAuditLog({
      action: "minigame_instance.roulette.spin",
      performedBy: user.uid,
      targetId: id,
      targetType: "minigame_instance",
      details: { slug, winnerId: winner.id, alias, spinNumber },
      timestamp: now,
    });

    res.json({
      success: true,
      data: { winnerId: winner.id, alias, spinNumber },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

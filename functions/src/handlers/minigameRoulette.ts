import { randomInt } from "node:crypto";
import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { isTransientFirestoreError } from "../utils/firestoreErrors";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";

interface RouletteWinnerEntry {
  uid: string;
  alias: string;
  spinNumber: number;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

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

    const participantsCol = instanceRef.collection("participants");
    const aggregateRef = instanceRef.collection("aggregates").doc("current");
    const participantsSnap = await (typeof participantsCol.select === "function"
      ? participantsCol.select("alias", "rouletteWonAt").get()
      : participantsCol.get());
    const totalParticipants = participantsSnap.docs.length;
    const eligibleCandidates = shuffleInPlace(
      participantsSnap.docs.filter((doc) => {
        const wonAt = (doc.data() as { rouletteWonAt?: unknown }).rouletteWonAt;
        return wonAt === null || wonAt === undefined;
      })
    );

    if (eligibleCandidates.length === 0) {
      res
        .status(400)
        .json({ success: false, error: "No hay participantes elegibles" });
      return;
    }

    const now = FieldValue.serverTimestamp();
    const outcome = await db.runTransaction(async (tx) => {
      const [freshSnap, aggSnap] = await Promise.all([
        tx.get(instanceRef),
        tx.get(aggregateRef),
      ]);
      const freshInstance = freshSnap.data() as
        { state?: string; spinCount?: number } | undefined;
      if (freshInstance?.state !== "live") return null;

      let chosen: { id: string; alias: string } | null = null;
      for (const candidate of eligibleCandidates) {
        const candidateRef = participantsCol.doc(candidate.id);
        const freshCandidate = await tx.get(candidateRef);
        const data = freshCandidate.data() as
          { alias?: string; rouletteWonAt?: unknown } | undefined;
        if (
          freshCandidate.exists &&
          (data?.rouletteWonAt === null || data?.rouletteWonAt === undefined)
        ) {
          chosen = {
            id: candidate.id,
            alias: data?.alias ?? "Anónimo",
          };
          break;
        }
      }
      if (!chosen) return null;

      const spinCount = (freshInstance.spinCount ?? 0) + 1;
      const existingAgg = aggSnap.data() as
        | { winners?: RouletteWinnerEntry[]; totalParticipants?: number }
        | undefined;
      const existingWinners = Array.isArray(existingAgg?.winners)
        ? existingAgg.winners.filter((w) => w.uid !== chosen.id)
        : [];
      const winners: RouletteWinnerEntry[] = [
        ...existingWinners,
        { uid: chosen.id, alias: chosen.alias, spinNumber: spinCount },
      ];
      const knownTotal = Math.max(
        existingAgg?.totalParticipants ?? 0,
        totalParticipants
      );
      const eligibleCount = Math.max(0, knownTotal - winners.length);

      tx.update(instanceRef, {
        spinCount,
        lastSpinWinnerId: chosen.id,
        lastSpinWinnerAlias: chosen.alias,
        lastSpinAt: now,
      });
      tx.update(participantsCol.doc(chosen.id), {
        rouletteWonAt: now,
        rouletteSpinNumber: spinCount,
      });
      tx.set(
        aggregateRef,
        {
          winners,
          totalParticipants: knownTotal,
          eligibleCount,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        winnerId: chosen.id,
        alias: chosen.alias,
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
    const status = isTransientFirestoreError(err) ? 503 : 500;
    res.status(status).json({ success: false, error: safeError(err) });
  }
}

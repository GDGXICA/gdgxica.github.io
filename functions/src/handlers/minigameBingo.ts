import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { completedLines, markedFromDrawn } from "../services/bingoClassic";
import { ensureDrawOrder, readDrawOrder } from "../services/bingoDrawStore";

interface ClassicBingoConfig {
  terms?: string[];
  classic?: boolean;
  prizes?: number;
  maxWinnersPerDraw?: number;
}

interface BingoInstanceData {
  type?: string;
  state?: string;
  config?: ClassicBingoConfig;
  drawCount?: number;
  drawnTerms?: string[];
  bingoWinnerCount?: number;
}

interface ParticipantData {
  alias?: string;
  bingoCard?: string[];
  bingoWonAt?: unknown;
  bingoRank?: number;
  bingoWinDraw?: number;
}

function instanceRefFor(slug: string, id: string) {
  return admin.firestore().doc(`events/${slug}/minigames/${id}`);
}

// Shared preamble for both endpoints: the instance must exist, be a bingo
// in classic mode, and be live. Answers the client itself and returns
// null when any of that fails.
async function loadLiveClassicInstance(
  slug: string,
  id: string,
  res: Response
): Promise<{
  ref: admin.firestore.DocumentReference;
  data: BingoInstanceData;
} | null> {
  const ref = instanceRefFor(slug, id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ success: false, error: "Instancia no encontrada" });
    return null;
  }
  const data = snap.data() as BingoInstanceData;
  if (data.type !== "bingo") {
    res
      .status(400)
      .json({ success: false, error: "No es una instancia de bingo" });
    return null;
  }
  if (data.config?.classic !== true) {
    res.status(400).json({
      success: false,
      error: "Este bingo no está en modo clásico",
    });
    return null;
  }
  if (data.state !== "live") {
    res.status(400).json({
      success: false,
      error: "El bingo debe estar en vivo",
    });
    return null;
  }
  return { ref, data };
}

// POST /api/events/:slug/minigames/:id/bingo/draw
//
// Calls the next ball. The sequence was sealed when the instance was
// attached, so this only ever reveals one more entry of it — the admin
// has no say in which term comes up, which is what lets us promise that
// wins are staggered.
export async function drawBall(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;

    const loaded = await loadLiveClassicInstance(slug, id, res);
    if (!loaded) return;
    const { ref, data } = loaded;

    // Attach seals the sequence, but a bingo attached before classic
    // mode existed (or one whose seal write lost a race) would have
    // none. Sealing here keeps the button working either way.
    const order = await ensureDrawOrder(ref, data.config?.terms ?? []);
    if (order.length === 0) {
      res.status(400).json({
        success: false,
        error: "La plantilla no tiene términos para cantar",
      });
      return;
    }

    const drawn = await ref.firestore.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const count = (fresh.data() as BingoInstanceData).drawCount ?? 0;
      if (count >= order.length) return null;

      const term = order[count];
      tx.update(ref, {
        drawCount: count + 1,
        // Rewritten whole rather than appended: arrayUnion would silently
        // reorder on a repeated term, and the order of this list is what
        // the projector animates.
        drawnTerms: order.slice(0, count + 1),
        lastDrawnTerm: term,
        lastDrawAt: FieldValue.serverTimestamp(),
      });
      return { term, drawCount: count + 1 };
    });

    if (!drawn) {
      res.status(400).json({
        success: false,
        error: "Ya se cantaron todas las bolas",
      });
      return;
    }

    await writeAuditLog({
      action: "minigame_instance.bingo.draw",
      performedBy: user.uid,
      targetId: id,
      targetType: "minigame_instance",
      details: { slug, term: drawn.term, drawCount: drawn.drawCount },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      data: {
        term: drawn.term,
        drawCount: drawn.drawCount,
        remaining: order.length - drawn.drawCount,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// POST /api/events/:slug/minigames/:id/bingo/claim
//
// A participant pressing "¡Bingo!". Nothing from the client is trusted:
// the server rebuilds the marked card from its own record of which balls
// were called, checks the line itself, and assigns the rank atomically so
// two claims in the same second still come out as 1st and 2nd rather than
// a tie nobody can settle in front of the room.
export async function claim(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;

    const loaded = await loadLiveClassicInstance(slug, id, res);
    if (!loaded) return;
    const { ref, data } = loaded;

    const participantRef = ref.collection("participants").doc(user.uid);
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
      res.status(404).json({
        success: false,
        error: "No estás participando en este bingo",
      });
      return;
    }
    const participant = participantSnap.data() as ParticipantData;
    const card = participant.bingoCard ?? [];
    if (card.length === 0) {
      res
        .status(400)
        .json({ success: false, error: "No tienes un cartón asignado" });
      return;
    }

    // Prefer the instance's own list of called balls; fall back to the
    // sealed sequence when an older instance only tracked the count.
    const drawCount = data.drawCount ?? 0;
    const drawnTerms =
      data.drawnTerms ?? (await readDrawOrder(ref)).slice(0, drawCount);

    const marked = markedFromDrawn(card, drawnTerms);
    const lines = completedLines(marked);
    if (lines.length === 0) {
      res.status(400).json({
        success: false,
        error: "Todavía no tienes una línea completa con las bolas cantadas",
      });
      return;
    }

    const prizes = data.config?.prizes ?? 3;
    const result = await ref.firestore.runTransaction(async (tx) => {
      const [freshInstance, freshParticipant] = await Promise.all([
        tx.get(ref),
        tx.get(participantRef),
      ]);
      const existing = freshParticipant.data() as ParticipantData | undefined;
      if (existing?.bingoWonAt) {
        // Double tap, or a reconnect replaying the claim. Give back the
        // rank they already hold instead of minting a second one.
        return {
          rank: existing.bingoRank ?? 0,
          winDraw: existing.bingoWinDraw ?? drawCount,
          alreadyWon: true,
        };
      }

      const winnerCount =
        (freshInstance.data() as BingoInstanceData).bingoWinnerCount ?? 0;
      const rank = winnerCount + 1;

      tx.update(ref, { bingoWinnerCount: rank });
      tx.update(participantRef, {
        // Server-owned: firestore.rules forbids a classic-mode client
        // from writing bingoWonAt at all.
        bingoWonAt: FieldValue.serverTimestamp(),
        bingoRank: rank,
        bingoWinDraw: drawCount,
        // Overwrite the self-reported marks with what was actually
        // called, so the highlighted line matches the verified win.
        bingoMarked: marked,
      });
      return { rank, winDraw: drawCount, alreadyWon: false };
    });

    if (!result.alreadyWon) {
      await writeAuditLog({
        action: "minigame_participant.bingo.claim",
        performedBy: user.uid,
        targetId: id,
        targetType: "minigame_instance",
        details: {
          slug,
          alias: participant.alias ?? "Anónimo",
          rank: result.rank,
          winDraw: result.winDraw,
        },
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    res.json({
      success: true,
      data: {
        rank: result.rank,
        winDraw: result.winDraw,
        prizes,
        hasPrize: result.rank > 0 && result.rank <= prizes,
        lines,
        alreadyWon: result.alreadyWon,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

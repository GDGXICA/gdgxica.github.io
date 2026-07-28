import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { isCleanAlias } from "../services/profanity";
import { generateBingoCard } from "../services/bingo";
import {
  buildCardCandidates,
  candidateWinIndices,
  earliestWinFloor,
  pickStaggeredCard,
  type CardCandidate,
} from "../services/bingoClassic";
import { ensureDrawOrder, winSlotsCol } from "../services/bingoDrawStore";

interface BingoConfig {
  terms?: string[];
  classic?: boolean;
  maxWinnersPerDraw?: number;
}

interface InstanceData {
  type?: string;
  state?: string;
  config?: BingoConfig;
}

interface JoinedInstanceSummary {
  id: string;
  type: string;
  joined: boolean;
  bingoCard?: string[];
}

// Everything the classic-mode dealer needs that can be computed before
// the transaction opens: a handful of scored candidate cards and the
// balls they would win on. The sealed sequence never changes, so this is
// safe to do outside.
interface ClassicDealPlan {
  candidates: CardCandidate[];
  winIndices: number[];
  maxWinnersPerDraw: number;
}

async function prepareClassicDeal(
  instanceRef: DocumentReference,
  instanceId: string,
  config: BingoConfig,
  uid: string
): Promise<ClassicDealPlan | null> {
  const terms = config.terms ?? [];
  try {
    const order = await ensureDrawOrder(instanceRef, terms);
    if (order.length === 0) return null;

    const candidates = buildCardCandidates(
      terms,
      order,
      `${uid}:${instanceId}`,
      undefined,
      earliestWinFloor(order.length)
    );
    if (candidates.length === 0) return null;

    return {
      candidates,
      winIndices: candidateWinIndices(candidates),
      maxWinnersPerDraw: Math.max(1, config.maxWinnersPerDraw ?? 1),
    };
  } catch {
    // Malformed bank (fewer than 16 usable terms). Same tolerance as
    // conference mode: hand out no card rather than fail the whole join.
    return null;
  }
}

// POST /api/events/:slug/minigames/join
//
// Public participant entry point. Auth uses any Firebase ID token
// (anonymous OK). Idempotent: subsequent calls return the alias that
// was stored on the first successful join, even if the request body
// carries a different alias — alias is fixed per (event, uid).
export async function join(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const requestedAlias = (req.body as { alias: string }).alias.trim();

    if (!isCleanAlias(requestedAlias)) {
      res.status(400).json({ success: false, error: "Alias no permitido" });
      return;
    }

    const db = admin.firestore();
    const instancesSnap = await db
      .collection("events")
      .doc(slug)
      .collection("minigames")
      .where("state", "==", "live")
      .limit(50)
      .get();

    if (instancesSnap.empty) {
      res.json({
        success: true,
        data: { alias: requestedAlias, instances: [] },
      });
      return;
    }

    // Run one transaction per instance. Parallel is safe because each
    // transaction touches a different participant doc, so there is no
    // contention. Bingo cards are deterministic per (uid, instanceId)
    // so retries land on the same card.
    let canonicalAlias = requestedAlias;
    const summaries = await Promise.all(
      instancesSnap.docs.map(async (instanceDoc) => {
        const instanceId = instanceDoc.id;
        const instanceData = instanceDoc.data() as InstanceData;
        const participantRef = instanceDoc.ref
          .collection("participants")
          .doc(user.uid);

        const summary: JoinedInstanceSummary = {
          id: instanceId,
          type: instanceData.type ?? "unknown",
          joined: false,
        };

        const isClassicBingo =
          instanceData.type === "bingo" &&
          instanceData.config?.classic === true;

        // Scoring candidate cards needs the sealed calling sequence, so
        // it happens before the transaction opens — a transaction may
        // not read anything after its first write.
        const deal = isClassicBingo
          ? await prepareClassicDeal(
              instanceDoc.ref,
              instanceId,
              instanceData.config ?? {},
              user.uid
            )
          : null;

        await db.runTransaction(async (tx) => {
          const existing = await tx.get(participantRef);
          if (existing.exists) {
            const data = existing.data() as
              { alias?: string; bingoCard?: string[] } | undefined;
            // Lock alias to whatever was stored first.
            if (data?.alias) {
              canonicalAlias = data.alias;
            }
            if (data?.bingoCard) {
              summary.bingoCard = data.bingoCard;
            }
            summary.joined = false;
            return;
          }

          const participantDoc: Record<string, unknown> = {
            uid: user.uid,
            alias: requestedAlias,
            joinedAt: FieldValue.serverTimestamp(),
          };

          if (deal) {
            // Classic mode. Which ball each card wins on is already
            // decided by the sealed sequence, so we look at what is
            // taken and deal a card that wins on a free ball. That is
            // what stops five people from claiming at once when there
            // are three prizes.
            const slots = winSlotsCol(instanceDoc.ref);
            const takenSnap = await tx.get(
              slots.where("winIndex", "in", deal.winIndices)
            );
            const occupancy: Record<number, number> = {};
            for (const doc of takenSnap.docs) {
              const idx = (doc.data() as { winIndex?: number }).winIndex;
              if (typeof idx === "number") {
                occupancy[idx] = (occupancy[idx] ?? 0) + 1;
              }
            }

            const pick = pickStaggeredCard(
              deal.candidates,
              occupancy,
              deal.maxWinnersPerDraw
            );
            if (pick) {
              participantDoc.bingoCard = pick.card;
              summary.bingoCard = pick.card;
              // The reservation lives in a private collection: the
              // participant doc is world-readable, and "you win on ball
              // 31" would spoil the game for everyone who looked.
              tx.set(slots.doc(user.uid), {
                uid: user.uid,
                winIndex: pick.winIndex,
                deal: pick.attempt,
                relaxed: pick.relaxed,
                createdAt: FieldValue.serverTimestamp(),
              });
            } else {
              participantDoc.bingoCard = [];
            }
          } else if (instanceData.type === "bingo") {
            const terms = instanceData.config?.terms ?? [];
            // generateBingoCard validates length and dedupes; if the
            // template is somehow short we surface a clean error
            // instead of crashing the whole join.
            try {
              const card = generateBingoCard(
                terms,
                `${user.uid}:${instanceId}`
              );
              participantDoc.bingoCard = card;
              summary.bingoCard = card;
            } catch {
              // Skip card seeding for malformed bingo templates; the
              // participant doc is still useful (alias, joinedAt).
              participantDoc.bingoCard = [];
            }
          }

          tx.set(participantRef, participantDoc);
          summary.joined = true;
        });

        return summary;
      })
    );

    await writeAuditLog({
      action: "minigame_participant.join",
      performedBy: user.uid,
      targetId: slug,
      targetType: "event",
      details: {
        alias: canonicalAlias,
        instanceCount: summaries.length,
        newJoins: summaries.filter((s) => s.joined).length,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      data: {
        alias: canonicalAlias,
        instances: summaries,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import { logParticipantAudit } from "../utils/audit";
import {
  isAlreadyExistsError,
  isTransientFirestoreError,
} from "../utils/firestoreErrors";
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
import {
  getOrLoadInstance,
  getOrLoadLiveInstances,
  markParticipantJoined,
} from "../services/minigameCache";

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
    return null;
  }
}

export async function join(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as { alias: string; instanceId?: string };
    const requestedAlias = body.alias.trim();
    const targetInstanceId = body.instanceId;

    if (!isCleanAlias(requestedAlias)) {
      res.status(400).json({ success: false, error: "Alias no permitido" });
      return;
    }

    const db = admin.firestore();
    const minigamesCol = db
      .collection("events")
      .doc(slug)
      .collection("minigames");

    let targetDocs: Array<{
      id: string;
      ref: DocumentReference;
      data: () => InstanceData;
    }>;

    if (targetInstanceId) {
      const singleData = (await getOrLoadInstance(
        slug,
        targetInstanceId,
        async () => {
          const singleSnap = await minigamesCol.doc(targetInstanceId).get();
          return singleSnap.exists ? (singleSnap.data() ?? null) : null;
        }
      )) as InstanceData | null;
      targetDocs =
        singleData?.state === "live"
          ? [
              {
                id: targetInstanceId,
                ref: minigamesCol.doc(targetInstanceId),
                data: () => singleData,
              },
            ]
          : [];
    } else {
      const cachedLive = await getOrLoadLiveInstances(slug, async () => {
        const instancesSnap = await minigamesCol
          .where("state", "==", "live")
          .limit(50)
          .get();
        return instancesSnap.docs.map((doc) => ({
          id: doc.id,
          data: doc.data() as Record<string, unknown>,
        }));
      });
      targetDocs = cachedLive.map((entry) => ({
        id: entry.id,
        ref: minigamesCol.doc(entry.id),
        data: () => entry.data as InstanceData,
      }));
    }

    if (targetDocs.length === 0) {
      res.json({
        success: true,
        data: { alias: requestedAlias, instances: [] },
      });
      return;
    }

    let canonicalAlias = requestedAlias;
    const summaries = await Promise.all(
      targetDocs.map(async (instanceDoc) => {
        const instanceId = instanceDoc.id;
        const instanceData = instanceDoc.data();
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

        if (isClassicBingo) {
          const deal = await prepareClassicDeal(
            instanceDoc.ref,
            instanceId,
            instanceData.config ?? {},
            user.uid
          );

          await db.runTransaction(async (tx) => {
            const existing = await tx.get(participantRef);
            if (existing.exists) {
              const data = existing.data() as
                { alias?: string; bingoCard?: string[] } | undefined;
              if (data?.alias) canonicalAlias = data.alias;
              if (data?.bingoCard) summary.bingoCard = data.bingoCard;
              summary.joined = false;
              return;
            }

            const participantDoc: Record<string, unknown> = {
              uid: user.uid,
              alias: requestedAlias,
              joinedAt: FieldValue.serverTimestamp(),
            };

            if (deal) {
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
            } else {
              participantDoc.bingoCard = [];
            }

            tx.set(participantRef, participantDoc);
            summary.joined = true;
          });

          markParticipantJoined(slug, instanceId, user.uid);
          return summary;
        }

        const participantDoc: Record<string, unknown> = {
          uid: user.uid,
          alias: requestedAlias,
          joinedAt: FieldValue.serverTimestamp(),
        };

        if (instanceData.type === "bingo") {
          const terms = instanceData.config?.terms ?? [];
          try {
            const card = generateBingoCard(terms, `${user.uid}:${instanceId}`);
            participantDoc.bingoCard = card;
            summary.bingoCard = card;
          } catch {
            participantDoc.bingoCard = [];
          }
        }

        try {
          await participantRef.create(participantDoc);
          summary.joined = true;
        } catch (err) {
          if (!isAlreadyExistsError(err)) throw err;
          const existing = await participantRef.get();
          const data = existing.data() as
            { alias?: string; bingoCard?: string[] } | undefined;
          if (data?.alias) canonicalAlias = data.alias;
          if (data?.bingoCard) summary.bingoCard = data.bingoCard;
          summary.joined = false;
        }

        markParticipantJoined(slug, instanceId, user.uid);
        return summary;
      })
    );

    logParticipantAudit(
      {
        action: "minigame_participant.join",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: {
          alias: canonicalAlias,
          instanceCount: summaries.length,
          newJoins: summaries.filter((s) => s.joined).length,
        },
      },
      req
    );

    res.json({
      success: true,
      data: {
        alias: canonicalAlias,
        instances: summaries,
      },
    });
  } catch (err) {
    const status = isTransientFirestoreError(err) ? 503 : 500;
    res.status(status).json({ success: false, error: safeError(err) });
  }
}

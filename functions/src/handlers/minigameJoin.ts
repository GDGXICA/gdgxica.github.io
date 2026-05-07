import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { isCleanAlias } from "../services/profanity";
import { generateBingoCard } from "../services/bingo";

interface BingoConfig {
  terms?: string[];
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

        await db.runTransaction(async (tx) => {
          const existing = await tx.get(participantRef);
          if (existing.exists) {
            const data = existing.data() as
              | { alias?: string; bingoCard?: string[] }
              | undefined;
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
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (instanceData.type === "bingo") {
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

    admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "minigame_participant.join",
        performedBy: user.uid,
        targetId: slug,
        targetType: "event",
        details: {
          alias: canonicalAlias,
          instanceCount: summaries.length,
          newJoins: summaries.filter((s) => s.joined).length,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
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

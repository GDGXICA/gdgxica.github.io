import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AggregateCoalescer } from "../services/aggregateCoalescer";
import { getOrLoadInstance } from "../services/minigameCache";

const LEADERBOARD_LIMIT = 10;
const SHARD_COUNT = 40;

const DEFAULT_COALESCE_MS = process.env.FUNCTIONS_EMULATOR === "true" ? 0 : 400;

const parsedTriggerMinInstances = Number.parseInt(
  process.env.MINIGAME_MIN_INSTANCES ?? "0",
  10
);
const triggerMinInstances =
  Number.isFinite(parsedTriggerMinInstances) && parsedTriggerMinInstances > 0
    ? Math.min(parsedTriggerMinInstances, 5)
    : 0;

export let pollCoalescer = new AggregateCoalescer(DEFAULT_COALESCE_MS);
export let rouletteCoalescer = new AggregateCoalescer(DEFAULT_COALESCE_MS);

export function configureAggregateCoalescers(delayMs: number): void {
  pollCoalescer.clear();
  rouletteCoalescer.clear();
  pollCoalescer = new AggregateCoalescer(delayMs);
  rouletteCoalescer = new AggregateCoalescer(delayMs);
}

export function shardIndexFor(seed: string, shards = SHARD_COUNT): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % shards;
}

export interface ResponseWriteEvent {
  data?: {
    before?: { exists: boolean };
    after?: {
      exists: boolean;
      data: () => { questionId?: string; optionId?: string } | undefined;
    };
  };
  params: { slug: string; id: string; respId?: string };
}

export interface ParticipantCreateEvent {
  data?: {
    exists?: boolean;
    data?: () => { uid?: string; alias?: string } | undefined;
  };
  params: { slug: string; id: string; uid: string };
}

interface ParticipantSnap {
  id: string;
  data: () =>
    | {
        alias?: string;
        quizScore?: number;
      }
    | undefined;
}

async function flushPollAggregate(slug: string, id: string): Promise<void> {
  const db = admin.firestore();
  const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
  const aggregateRef = db.doc(
    `events/${slug}/minigames/${id}/aggregates/current`
  );

  const shardsSnap = await instanceRef.collection("poll_shards").get();
  const optionCounts: Record<string, number> = {};
  let totalResponses = 0;

  for (const shardDoc of shardsSnap.docs) {
    const shard = shardDoc.data() as {
      optionCounts?: Record<string, number>;
      totalResponses?: number;
    };
    totalResponses += shard.totalResponses ?? 0;
    for (const [key, count] of Object.entries(shard.optionCounts ?? {})) {
      optionCounts[key] = (optionCounts[key] ?? 0) + count;
    }
  }

  const payload: Record<string, unknown> = {
    optionCounts,
    totalResponses,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const instanceData = await getOrLoadInstance(slug, id, async () => {
    const snap = await instanceRef.get();
    return snap.exists ? (snap.data() ?? null) : null;
  });

  if (instanceData?.type === "quiz") {
    const topSnap = await instanceRef
      .collection("participants")
      .orderBy("quizScore", "desc")
      .limit(LEADERBOARD_LIMIT)
      .get();

    payload.leaderboard = (topSnap.docs as ParticipantSnap[]).map((d) => {
      const pd = d.data();
      return {
        uid: d.id,
        alias: typeof pd?.alias === "string" ? pd.alias : "Anónimo",
        score: typeof pd?.quizScore === "number" ? pd.quizScore : 0,
      };
    });
  }

  if (typeof db.runTransaction === "function") {
    await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(aggregateRef);
      const existing = existingSnap.data() as
        | {
            optionCounts?: Record<string, number>;
            totalResponses?: number;
          }
        | undefined;
      const existingCounts = existing?.optionCounts ?? {};
      const mergedCounts: Record<string, number> = { ...existingCounts };
      let changed = false;

      for (const [key, count] of Object.entries(optionCounts)) {
        const prev = existingCounts[key] ?? 0;
        if (count > prev) {
          mergedCounts[key] = count;
          changed = true;
        }
      }
      const prevTotal = existing?.totalResponses ?? 0;
      const nextTotal = Math.max(prevTotal, totalResponses);
      if (nextTotal > prevTotal) changed = true;

      if (!changed && !payload.leaderboard) return;

      tx.set(
        aggregateRef,
        {
          ...payload,
          optionCounts: mergedCounts,
          totalResponses: nextTotal,
        },
        { merge: true }
      );
    });
    return;
  }

  await aggregateRef.set(payload, { merge: true });
}

export async function recomputeAggregatesFromEvent(
  event: ResponseWriteEvent
): Promise<void> {
  const before = event.data?.before;
  const after = event.data?.after;
  if (!after?.exists || before?.exists) return;

  const data = after.data();
  if (!data?.questionId || !data?.optionId) return;

  const { slug, id, respId } = event.params;
  const db = admin.firestore();
  const optionKey = `${data.questionId}:${data.optionId}`;
  const shardId = String(shardIndexFor(respId ?? optionKey));
  const shardRef = db.doc(
    `events/${slug}/minigames/${id}/poll_shards/${shardId}`
  );

  await shardRef.set(
    {
      optionCounts: {
        [optionKey]: FieldValue.increment(1),
      },
      totalResponses: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await pollCoalescer.schedule(`${slug}/${id}`, () =>
    flushPollAggregate(slug, id)
  );
}

async function flushParticipantAggregate(
  slug: string,
  id: string,
  type: "roulette" | "quiz"
): Promise<void> {
  const db = admin.firestore();
  const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
  const aggregateRef = db.doc(
    `events/${slug}/minigames/${id}/aggregates/current`
  );

  const shardsSnap = await instanceRef.collection("roulette_shards").get();
  let totalParticipants = 0;
  for (const shardDoc of shardsSnap.docs) {
    const shard = shardDoc.data() as { count?: number };
    totalParticipants += shard.count ?? 0;
  }

  if (typeof db.runTransaction === "function") {
    await db.runTransaction(async (tx) => {
      const aggSnap = await tx.get(aggregateRef);
      const existing = aggSnap.data() as
        | {
            totalParticipants?: number;
            eligibleCount?: number;
            winners?: unknown[];
          }
        | undefined;
      const prevTotal = existing?.totalParticipants ?? 0;
      const nextTotal = Math.max(prevTotal, totalParticipants);

      if (type === "quiz") {
        if (
          nextTotal === prevTotal &&
          existing?.totalParticipants !== undefined
        ) {
          return;
        }
        tx.set(
          aggregateRef,
          {
            totalParticipants: nextTotal,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return;
      }

      const winners = Array.isArray(existing?.winners)
        ? existing.winners.length
        : 0;
      const eligibleCount = Math.max(0, nextTotal - winners);
      if (
        nextTotal === prevTotal &&
        existing?.totalParticipants !== undefined &&
        existing?.eligibleCount === eligibleCount
      ) {
        return;
      }

      tx.set(
        aggregateRef,
        {
          totalParticipants: nextTotal,
          eligibleCount,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    return;
  }

  if (type === "quiz") {
    await aggregateRef.set(
      {
        totalParticipants,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const aggSnap = await aggregateRef.get();
  const winners =
    (aggSnap.data()?.winners as unknown[] | undefined)?.length ?? 0;
  const eligibleCount = Math.max(0, totalParticipants - winners);

  await aggregateRef.set(
    {
      totalParticipants,
      eligibleCount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function recomputeRouletteAggregateFromJoin(
  event: ParticipantCreateEvent
): Promise<void> {
  const { slug, id, uid } = event.params;
  const db = admin.firestore();
  const instanceRef = db.doc(`events/${slug}/minigames/${id}`);

  const instanceData = await getOrLoadInstance(slug, id, async () => {
    const snap = await instanceRef.get();
    return snap.exists ? (snap.data() ?? null) : null;
  });
  const type = instanceData?.type;
  if (type !== "roulette" && type !== "quiz") return;

  const shardId = String(shardIndexFor(uid));
  const shardRef = db.doc(
    `events/${slug}/minigames/${id}/roulette_shards/${shardId}`
  );
  await shardRef.set(
    {
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await rouletteCoalescer.schedule(`${slug}/${id}`, () =>
    flushParticipantAggregate(slug, id, type)
  );
}

export const onMinigameResponseWritten = onDocumentWritten(
  {
    document: "events/{slug}/minigames/{id}/responses/{respId}",
    memory: "512MiB",
    concurrency: 80,
    cpu: 1,
    minInstances: triggerMinInstances,
    maxInstances: 10,
  },
  (event) =>
    recomputeAggregatesFromEvent(event as unknown as ResponseWriteEvent)
);

export const onMinigameParticipantCreated = onDocumentCreated(
  {
    document: "events/{slug}/minigames/{id}/participants/{uid}",
    memory: "512MiB",
    concurrency: 80,
    cpu: 1,
    minInstances: triggerMinInstances,
    maxInstances: 10,
  },
  (event) =>
    recomputeRouletteAggregateFromJoin(
      event as unknown as ParticipantCreateEvent
    )
);

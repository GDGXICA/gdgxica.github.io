import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AggregateCoalescer } from "../services/aggregateCoalescer";
import { getOrLoadInstance } from "../services/minigameCache";

const LEADERBOARD_LIMIT = 10;
const SHARD_COUNT = 20;

const DEFAULT_COALESCE_MS =
  process.env.FUNCTIONS_EMULATOR === "true" ? 0 : 250;

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

async function flushRouletteAggregate(slug: string, id: string): Promise<void> {
  const db = admin.firestore();
  const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
  const aggregateRef = db.doc(
    `events/${slug}/minigames/${id}/aggregates/current`
  );

  const [shardsSnap, aggSnap] = await Promise.all([
    instanceRef.collection("roulette_shards").get(),
    aggregateRef.get(),
  ]);

  let totalParticipants = 0;
  for (const shardDoc of shardsSnap.docs) {
    const shard = shardDoc.data() as { count?: number };
    totalParticipants += shard.count ?? 0;
  }

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
  if (instanceData?.type !== "roulette") return;

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
    flushRouletteAggregate(slug, id)
  );
}

export const onMinigameResponseWritten = onDocumentWritten(
  {
    document: "events/{slug}/minigames/{id}/responses/{respId}",
    memory: "512MiB",
    concurrency: 80,
    cpu: 1,
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
  },
  (event) =>
    recomputeRouletteAggregateFromJoin(
      event as unknown as ParticipantCreateEvent
    )
);

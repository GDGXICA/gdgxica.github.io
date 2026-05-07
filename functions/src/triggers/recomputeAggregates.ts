import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Fires whenever a response doc is written under a minigame instance and
// keeps the single `aggregates/current` doc in sync. Spectators (the
// projector view, the live overlays) listen to that one doc instead of the
// raw responses collection — so this trigger absorbs the fan-out and caps
// realtime read costs to 1 listener per game per phone.
//
// For poll responses we just bump optionCounts + totalResponses with
// FieldValue.increment (O(1)). For quiz responses we additionally rebuild
// the top-10 leaderboard by querying participants ordered by quizScore.
// That extra query is bounded (limit 10) and only fires for quiz games,
// so the cost stays well within the free tier even at ~200 attendees.
//
// Rule deletes are blocked, so we ignore the delete edge case (no
// `before && !after`). For pure update events (also blocked by rules)
// we still no-op to avoid double-counting.

const LEADERBOARD_LIMIT = 10;

export interface ResponseWriteEvent {
  data?: {
    before?: { exists: boolean };
    after?: {
      exists: boolean;
      data: () => { questionId?: string; optionId?: string } | undefined;
    };
  };
  params: { slug: string; id: string };
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

// Inner handler — exported for unit tests so we can drive it with a synthetic
// event without spinning up the emulator.
export async function recomputeAggregatesFromEvent(
  event: ResponseWriteEvent
): Promise<void> {
  const before = event.data?.before;
  const after = event.data?.after;
  // Skip everything except creates. Updates/deletes shouldn't happen with
  // the current rules, but defending here keeps aggregates accurate even
  // if rules drift later.
  if (!after?.exists || before?.exists) return;

  const data = after.data();
  if (!data?.questionId || !data?.optionId) return;

  const { slug, id } = event.params;
  const db = admin.firestore();
  const instanceRef = db.doc(`events/${slug}/minigames/${id}`);
  const aggregateRef = db.doc(
    `events/${slug}/minigames/${id}/aggregates/current`
  );

  const optionKey = `${data.questionId}:${data.optionId}`;
  await aggregateRef.set(
    {
      optionCounts: {
        [optionKey]: admin.firestore.FieldValue.increment(1),
      },
      totalResponses: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Quiz instances also keep a top-10 leaderboard in the same doc so
  // spectators only need one listener.
  const instanceSnap = await instanceRef.get();
  if (instanceSnap.data()?.type !== "quiz") return;

  const topSnap = await instanceRef
    .collection("participants")
    .orderBy("quizScore", "desc")
    .limit(LEADERBOARD_LIMIT)
    .get();

  const leaderboard = (topSnap.docs as ParticipantSnap[])
    .map((d) => {
      const pd = d.data();
      return {
        uid: d.id,
        alias: typeof pd?.alias === "string" ? pd.alias : "Anónimo",
        score: typeof pd?.quizScore === "number" ? pd.quizScore : 0,
      };
    })
    .filter((entry) => entry.score > 0);

  await aggregateRef.set(
    {
      leaderboard,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export const onMinigameResponseWritten = onDocumentWritten(
  "events/{slug}/minigames/{id}/responses/{respId}",
  // Cast at the call site so the v2 SDK's strong event type is preserved
  // for deployment without bleeding into our test-friendly inner shape.
  (event) =>
    recomputeAggregatesFromEvent(event as unknown as ResponseWriteEvent)
);

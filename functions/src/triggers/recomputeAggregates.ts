import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Fires whenever a response doc is written under a minigame instance and
// keeps the single `aggregates/current` doc in sync. Spectators (the
// projector view, the live overlays) listen to that one doc instead of the
// raw responses collection — so this trigger absorbs the fan-out and caps
// realtime read costs to 1 listener per game per phone.
//
// Implementation is intentionally O(1) per write: we use FieldValue.increment
// and merge: true. PR6 will extend this trigger to also recompute the quiz
// leaderboard (top N participants by score) — for now we just count votes
// and total responses, which is what the poll/wordcloud overlays consume.
//
// Rule deletes responses are blocked, so we ignore the delete edge case
// (no `before && !after`). For pure update events (also blocked by rules in
// PR3+), we still no-op to avoid double-counting.
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
  const aggregateRef = admin
    .firestore()
    .doc(`events/${slug}/minigames/${id}/aggregates/current`);

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
}

export const onMinigameResponseWritten = onDocumentWritten(
  "events/{slug}/minigames/{id}/responses/{respId}",
  // Cast at the call site so the v2 SDK's strong event type is preserved
  // for deployment without bleeding into our test-friendly inner shape.
  (event) =>
    recomputeAggregatesFromEvent(event as unknown as ResponseWriteEvent)
);

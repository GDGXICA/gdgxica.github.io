import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import type { PollConfig } from "../admin/minigame-templates/types";
import { useAggregates } from "./useAggregates";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  alias: string;
  title: string;
  config: PollConfig;
}

const QUESTION_ID = "main";

export function PollOverlay({ slug, instanceId, uid, title, config }: Props) {
  const { aggregates } = useAggregates(slug, instanceId);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect if we already voted on this poll (e.g. after refresh) so the
  // results view shows up immediately. Uses a one-shot getDoc instead of
  // a listener — once set we never need to re-fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getFirestore();
        const { doc, getDoc } = await import("firebase/firestore");
        const ref = doc(
          db,
          `events/${slug}/minigames/${instanceId}/responses/${uid}_${QUESTION_ID}`
        );
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as { optionId?: string } | undefined;
          if (data?.optionId) setVotedOptionId(data.optionId);
        }
      } catch {
        // Listener errors are surfaced separately via aggregates; ignore here.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, instanceId, uid]);

  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = config.options.reduce(
    (sum, opt) => sum + (counts[`${QUESTION_ID}:${opt.id}`] ?? 0),
    0
  );

  async function vote(optionId: string) {
    if (votedOptionId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const db = await getFirestore();
      const { doc, setDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );
      const ref = doc(
        db,
        `events/${slug}/minigames/${instanceId}/responses/${uid}_${QUESTION_ID}`
      );
      await setDoc(ref, {
        uid,
        questionId: QUESTION_ID,
        optionId,
        answeredAt: serverTimestamp(),
      });
      setVotedOptionId(optionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          Encuesta en vivo
        </span>
        <h2 className="text-primary mt-3 text-2xl font-semibold">{title}</h2>
        <p className="text-secondary mt-1 text-base">{config.question}</p>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {config.options.map((opt) => {
          const count = counts[`${QUESTION_ID}:${opt.id}`] ?? 0;
          const pct =
            totalForQuestion > 0
              ? Math.round((count / totalForQuestion) * 100)
              : 0;
          const isMine = votedOptionId === opt.id;

          if (votedOptionId) {
            return (
              <li
                key={opt.id}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
              >
                <div
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-all ${
                    isMine
                      ? "bg-blue-500/30"
                      : "bg-gray-300/40 dark:bg-gray-600/40"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {opt.label}
                    {isMine && (
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-300">
                        Tu voto
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm text-gray-700 tabular-nums dark:text-gray-300">
                    {count} · {pct}%
                  </span>
                </div>
              </li>
            );
          }

          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => vote(opt.id)}
                disabled={submitting}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-left font-medium text-gray-900 transition hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>

      {votedOptionId && (
        <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          {totalForQuestion} respuesta{totalForQuestion !== 1 && "s"} hasta
          ahora
        </p>
      )}
    </div>
  );
}

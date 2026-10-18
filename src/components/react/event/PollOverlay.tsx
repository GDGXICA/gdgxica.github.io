import { useEffect, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import { api } from "@/lib/api";
import type { PollConfig } from "../admin/minigame-templates/types";
import { useAggregates } from "./useAggregates";
import { answerErrorMessage } from "./answerError";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  alias: string;
  title: string;
  config: PollConfig;
  currentQuestionIndex?: number;
}

export function PollOverlay({
  slug,
  instanceId,
  uid,
  title,
  config,
  currentQuestionIndex = 0,
}: Props) {
  const questions = config.questions ?? [
    {
      id: "main",
      prompt: config.question ?? "",
      options: config.options ?? [],
    },
  ];
  const question =
    currentQuestionIndex < 0 ? null : (questions[currentQuestionIndex] ?? null);
  const questionId = question?.id ?? "main";
  const { aggregates } = useAggregates(slug, instanceId);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVotedOptionId(null);
  }, [questionId]);

  useEffect(() => {
    let cancelled = false;
    if (!question) return;
    (async () => {
      try {
        const db = await getFirestore();
        const { doc, getDoc } = await import("firebase/firestore");
        const ref = doc(
          db,
          `events/${slug}/minigames/${instanceId}/responses/${uid}_${questionId}`
        );
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as { optionId?: string } | undefined;
          if (data?.optionId) setVotedOptionId(data.optionId);
        }
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, instanceId, uid, questionId]);

  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = (question?.options ?? []).reduce(
    (sum, opt) => sum + (counts[`${questionId}:${opt.id}`] ?? 0),
    0
  );

  async function vote(optionId: string) {
    if (!question || votedOptionId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.answerPollQuestion(
        slug,
        instanceId,
        questionId,
        optionId
      );
      if (!result.success) throw new Error(answerErrorMessage(result.error));
      setVotedOptionId(optionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar");
    } finally {
      setSubmitting(false);
    }
  }

  if (!question)
    return (
      <div className="py-12 text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          Esperando la primera pregunta…
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          Pregunta {currentQuestionIndex + 1} de {questions.length}
        </p>
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {questions.map((item, index) => (
            <span
              key={item.id}
              className={`h-1.5 flex-1 rounded-full ${index <= currentQuestionIndex ? "bg-google-blue" : "bg-gray-200 dark:bg-gray-700"}`}
            />
          ))}
        </div>
        <h2 className="mt-8 text-sm font-semibold text-gray-600 dark:text-gray-300">
          {title}
        </h2>
        <p className="mt-2 text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl">
          {question.prompt}
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {votedOptionId ? "Así va la votación" : "Elige una opción para votar"}
        </p>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {question.options.map((opt) => {
          const count = counts[`${questionId}:${opt.id}`] ?? 0;
          const pct =
            totalForQuestion > 0
              ? Math.round((count / totalForQuestion) * 100)
              : 0;
          const isMine = votedOptionId === opt.id;

          if (votedOptionId) {
            return (
              <li
                key={opt.id}
                className={`relative min-h-16 overflow-hidden rounded-xl bg-gray-100 px-4 py-4 dark:bg-gray-800 ${isMine ? "outline-google-blue outline-2 outline-offset-2" : ""}`}
              >
                <div
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-all ${
                    isMine
                      ? "bg-blue-200 dark:bg-blue-900"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="min-w-0 font-semibold break-words text-gray-900 dark:text-white">
                    {opt.label}
                    {isMine && (
                      <span className="ml-2 text-xs font-bold text-blue-800 dark:text-blue-300">
                        Tu voto
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-gray-800 tabular-nums dark:text-gray-200">
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
                className="hover:border-google-blue focus-visible:outline-google-blue min-h-16 w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-left text-lg font-semibold text-gray-900 transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:bg-blue-50 hover:text-blue-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 motion-reduce:transition-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
              >
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>

      {votedOptionId && (
        <p
          className="mt-6 border-t border-gray-200 pt-5 text-center text-sm text-gray-600 tabular-nums dark:border-gray-700 dark:text-gray-300"
          role="status"
        >
          {totalForQuestion} respuesta{totalForQuestion !== 1 && "s"} hasta
          ahora
        </p>
      )}
    </div>
  );
}

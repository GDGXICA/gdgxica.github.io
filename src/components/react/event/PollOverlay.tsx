import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getFirestore } from "@/lib/firebase";
import type { PollConfig } from "../admin/minigame-templates/types";
import { answerErrorMessage } from "./answerError";
import { CheckIcon } from "./icons";
import { useAggregates } from "./useAggregates";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  alias: string;
  title: string;
  config: PollConfig;
  currentQuestionIndex?: number;
  justJoined?: boolean;
  closed?: boolean;
}

export function PollOverlay({
  slug,
  instanceId,
  uid,
  title,
  config,
  currentQuestionIndex = 0,
  justJoined = false,
  closed = false,
}: Props) {
  const questions = config.questions ?? [
    {
      id: "main",
      prompt: config.question ?? "",
      options: config.options ?? [],
    },
  ];
  const question =
    currentQuestionIndex < 0
      ? closed
        ? (questions[questions.length - 1] ?? null)
        : null
      : (questions[currentQuestionIndex] ?? null);
  const questionId = question?.id ?? "main";
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const showBars = Boolean(votedOptionId) || closed;
  const { aggregates } = useAggregates(
    showBars ? slug : null,
    showBars ? instanceId : null
  );
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeQuestionIdRef = useRef(questionId);
  activeQuestionIdRef.current = questionId;
  const initialQuestionIdRef = useRef<string | null>(
    question ? question.id : null
  );
  const restoredInitialRef = useRef(justJoined);

  useEffect(() => {
    setVotedOptionId(null);
    setPendingOptionId(null);
    setSubmitting(false);
    setError(null);
  }, [questionId]);

  useEffect(() => {
    if (
      !question ||
      !uid ||
      restoredInitialRef.current ||
      initialQuestionIdRef.current !== questionId
    ) {
      return;
    }
    restoredInitialRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const db = await getFirestore();
        const { doc, getDoc } = await import("firebase/firestore");
        const ref = doc(
          db,
          `events/${slug}/minigames/${instanceId}/responses/${uid}_${questionId}`
        );
        const snap = await getDoc(ref);
        if (cancelled || activeQuestionIdRef.current !== questionId) return;
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
  }, [slug, instanceId, uid, question, questionId]);

  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = (question?.options ?? []).reduce(
    (sum, opt) => sum + (counts[`${questionId}:${opt.id}`] ?? 0),
    0
  );

  async function vote(optionId: string) {
    if (!question || votedOptionId || submitting || closed) return;
    navigator.vibrate?.(10);
    const targetQuestionId = questionId;
    setSubmitting(true);
    setPendingOptionId(optionId);
    setError(null);
    try {
      const result = await api.answerPollQuestion(
        slug,
        instanceId,
        targetQuestionId,
        optionId
      );
      if (activeQuestionIdRef.current !== targetQuestionId) return;
      if (
        result.success ||
        result.status === 409 ||
        result.error === "already_answered"
      ) {
        setVotedOptionId(optionId);
        return;
      }
      setError(answerErrorMessage(result.error));
    } catch (err) {
      if (activeQuestionIdRef.current !== targetQuestionId) return;
      setError(err instanceof Error ? err.message : "No pudimos enviar");
    } finally {
      if (activeQuestionIdRef.current === targetQuestionId) {
        setPendingOptionId(null);
        setSubmitting(false);
      }
    }
  }

  if (!question) {
    return (
      <div className="py-10 text-center">
        <h2 className="m-0 font-(family-name:--font-display) text-2xl font-bold text-balance text-(--ink) sm:text-3xl">
          {title}
        </h2>
        <p className="mt-4 inline-flex items-center gap-3 text-(--muted)">
          <span
            className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
            aria-hidden="true"
          />
          Esperando la primera pregunta…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <p className="m-0 font-mono text-xs font-semibold tracking-wider text-(--muted) uppercase">
          Pregunta {Math.max(1, currentQuestionIndex + 1)} de {questions.length}
        </p>
        <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
          {questions.map((item, index) => (
            <span
              key={item.id}
              className={`h-1.5 flex-1 rounded-full ${
                index <= Math.max(0, currentQuestionIndex)
                  ? "bg-(--ochre)"
                  : "bg-(--surface-3)"
              }`}
            />
          ))}
        </div>
        <h2 className="mt-5 mb-0 font-mono text-xs font-medium tracking-wider text-(--muted) uppercase">
          {title}
        </h2>
        <p className="mt-1.5 font-(family-name:--font-display) text-[clamp(1.375rem,1.1rem+1.3vw,2rem)] leading-tight font-bold text-balance text-(--ink)">
          {question.prompt}
        </p>
        <p className="mt-2 text-sm text-(--muted)">
          {closed
            ? "Resultados finales de la encuesta"
            : votedOptionId
              ? "Así va la votación"
              : submitting
                ? "Enviando tu voto…"
                : "Elige una opción para votar"}
        </p>
      </div>

      {error && (
        <p
          className="mb-3 border-l-2 border-red-400 pl-3 text-sm text-red-200"
          role="alert"
        >
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
          const isPending = pendingOptionId === opt.id;

          if (showBars) {
            return (
              <li
                key={opt.id}
                className={`relative min-h-16 overflow-hidden rounded-xl border bg-(--surface-2) px-4 py-4 ${
                  isMine ? "border-(--ochre)" : "border-(--line)"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none ${
                    isMine ? "bg-(--ochre)/25" : "bg-(--surface-3)"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-semibold break-words text-(--ink)">
                    {isMine && (
                      <CheckIcon
                        size={16}
                        className="shrink-0 text-(--ochre)"
                      />
                    )}
                    <span>{opt.label}</span>
                    {isMine && (
                      <span className="ml-1 text-xs font-medium text-(--ochre)">
                        Tu voto
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold text-(--ink) tabular-nums">
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
                aria-busy={isPending}
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-(--surface-2) px-5 py-4 text-left text-base font-semibold text-(--ink) transition-[border-color,background-color,transform] hover:border-(--ochre)/60 hover:bg-(--surface-3) active:scale-[0.99] disabled:cursor-default motion-reduce:transition-none sm:text-lg ${
                  isPending
                    ? "border-(--ochre) ring-2 ring-(--ochre)"
                    : "border-(--line-strong) disabled:opacity-50"
                }`}
              >
                <span className="min-w-0 break-words">{opt.label}</span>
                {isPending && (
                  <span className="shrink-0 font-mono text-xs font-semibold text-(--ochre)">
                    Enviando…
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {showBars && (
        <p
          className="mt-5 border-t border-(--line) pt-4 text-center font-mono text-sm text-(--muted) tabular-nums"
          role="status"
        >
          {totalForQuestion} respuesta{totalForQuestion !== 1 && "s"}
          {closed ? " en total" : " hasta ahora"}
        </p>
      )}
    </div>
  );
}

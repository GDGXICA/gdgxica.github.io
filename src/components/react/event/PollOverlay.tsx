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
  const storageKey = `gdg_poll_vote_${uid}_${slug}_${instanceId}_${questionId}`;
  const readCachedVote = (key: string): string | null => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeCachedVote = (key: string, optId: string) => {
    try {
      window.sessionStorage.setItem(key, optId);
    } catch {
      return;
    }
  };

  const [votedOptionId, setVotedOptionId] = useState<string | null>(() =>
    justJoined ? null : readCachedVote(storageKey)
  );
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeVoteId = votedOptionId ?? pendingOptionId;
  const showBars = Boolean(activeVoteId) || closed;
  const { aggregates } = useAggregates(
    showBars ? slug : null,
    showBars ? instanceId : null
  );
  const submittingRef = useRef(false);
  const activeQuestionIdRef = useRef(questionId);
  activeQuestionIdRef.current = questionId;
  const initialQuestionIdRef = useRef<string | null>(
    question ? question.id : null
  );
  const restoredInitialRef = useRef(justJoined);

  useEffect(() => {
    const cached =
      !justJoined && initialQuestionIdRef.current === questionId
        ? readCachedVote(
            `gdg_poll_vote_${uid}_${slug}_${instanceId}_${questionId}`
          )
        : null;
    setVotedOptionId(cached);
    setPendingOptionId(null);
    setSubmitting(false);
    submittingRef.current = false;
    setError(null);
  }, [questionId, uid, slug, instanceId, justJoined]);

  const hasQuestion = Boolean(question);
  useEffect(() => {
    if (
      !hasQuestion ||
      !uid ||
      votedOptionId ||
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
          if (data?.optionId) {
            writeCachedVote(storageKey, data.optionId);
            setVotedOptionId(data.optionId);
          }
        }
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    slug,
    instanceId,
    uid,
    hasQuestion,
    questionId,
    votedOptionId,
    storageKey,
  ]);

  const rawCounts = aggregates?.optionCounts ?? {};
  const counts: Record<string, number> = { ...rawCounts };
  if (activeVoteId) {
    const myKey = `${questionId}:${activeVoteId}`;
    if ((counts[myKey] ?? 0) === 0) {
      counts[myKey] = 1;
    }
  }
  const totalForQuestion = (question?.options ?? []).reduce(
    (sum, opt) => sum + (counts[`${questionId}:${opt.id}`] ?? 0),
    0
  );

  async function vote(optionId: string) {
    if (
      !question ||
      votedOptionId ||
      submitting ||
      submittingRef.current ||
      closed
    ) {
      return;
    }
    navigator.vibrate?.(10);
    const targetQuestionId = questionId;
    const targetKey = `gdg_poll_vote_${uid}_${slug}_${instanceId}_${targetQuestionId}`;
    submittingRef.current = true;
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
        writeCachedVote(targetKey, optionId);
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
        submittingRef.current = false;
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
      <div className="mb-4 sm:mb-6">
        <p className="m-0 font-mono text-xs font-semibold tracking-wider text-(--muted) uppercase">
          Pregunta {Math.max(1, currentQuestionIndex + 1)} de {questions.length}
        </p>
        <div className="mt-2 flex gap-1.5 sm:mt-2.5" aria-hidden="true">
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
        <h2 className="mt-4 mb-0 font-mono text-xs font-medium tracking-wider text-(--muted) uppercase sm:mt-5">
          {title}
        </h2>
        <p className="mt-1.5 font-(family-name:--font-display) text-[clamp(1.25rem,1.05rem+1.3vw,2rem)] leading-tight font-bold text-balance text-(--ink)">
          {question.prompt}
        </p>
        <p className="mt-1.5 text-sm text-(--muted) sm:mt-2">
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

      <ul className="space-y-2.5 sm:space-y-3">
        {question.options.map((opt) => {
          const count = counts[`${questionId}:${opt.id}`] ?? 0;
          const pct =
            totalForQuestion > 0
              ? Math.round((count / totalForQuestion) * 100)
              : 0;
          const isMine = activeVoteId === opt.id;
          const isPending = pendingOptionId === opt.id;

          if (showBars) {
            return (
              <li
                key={opt.id}
                className={`relative min-h-14 overflow-hidden rounded-xl border bg-(--surface-2) px-3.5 py-3.5 sm:min-h-16 sm:px-4 sm:py-4 ${
                  isMine
                    ? "border-(--ochre) ring-1 ring-(--ochre)/50"
                    : "border-(--line)"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 transition-[width] duration-300 motion-reduce:transition-none ${
                    isMine ? "bg-(--ochre)/25" : "bg-(--surface-3)"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold break-words text-(--ink)">
                    {isMine && (
                      <CheckIcon
                        size={16}
                        className="shrink-0 text-(--ochre)"
                      />
                    )}
                    <span className="min-w-0 break-words">{opt.label}</span>
                    {isMine && (
                      <span className="rounded-full bg-(--ochre)/20 px-2 py-0.5 text-[11px] font-semibold text-(--ochre)">
                        {isPending ? "Enviando…" : "Tu voto"}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-(--ink) tabular-nums sm:text-sm">
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
                className={`flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-xl border bg-(--surface-2) px-4 py-3.5 text-left text-[0.9375rem] font-semibold text-(--ink) transition-[border-color,background-color,transform] select-none hover:border-(--ochre)/60 hover:bg-(--surface-3) active:scale-[0.99] disabled:cursor-default motion-reduce:transition-none sm:min-h-16 sm:px-5 sm:py-4 sm:text-lg ${
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

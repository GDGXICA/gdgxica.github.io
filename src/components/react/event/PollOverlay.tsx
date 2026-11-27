import { useEffect, useRef, useState } from "react";
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
  justJoined?: boolean;
}

export function PollOverlay({
  slug,
  instanceId,
  uid,
  title,
  config,
  currentQuestionIndex = 0,
  justJoined = false,
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
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const { aggregates } = useAggregates(
    votedOptionId ? slug : null,
    votedOptionId ? instanceId : null
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
    if (!question || votedOptionId || submitting) return;
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

  if (!question)
    return (
      <div className="py-12 text-center">
        <h2 className="m-0 text-3xl font-semibold tracking-[-0.02em] text-balance text-(--ink)">
          {title}
        </h2>
        <p className="mt-4 inline-flex items-center gap-3 text-(--muted)">
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
            aria-hidden="true"
          />
          Esperando la primera pregunta…
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7">
        <p className="n-mono m-0 text-(--muted)">
          Pregunta {currentQuestionIndex + 1} de {questions.length}
        </p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {questions.map((item, index) => (
            <span
              key={item.id}
              className={`h-1 flex-1 rounded-full ${index <= currentQuestionIndex ? "bg-(--ochre)" : "bg-(--surface-3)"}`}
            />
          ))}
        </div>
        <h2 className="mt-8 mb-0 text-[0.9375rem] font-medium text-(--muted)">
          {title}
        </h2>
        <p className="mt-2 text-[clamp(1.6rem,1.3rem+1.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.02em] text-balance text-(--ink)">
          {question.prompt}
        </p>
        <p className="mt-3 text-[0.9375rem] text-(--muted)">
          {votedOptionId
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

          if (votedOptionId) {
            return (
              <li
                key={opt.id}
                className={`relative min-h-16 overflow-hidden rounded-(--radius-sm) border bg-(--surface-2) px-4 py-4 ${isMine ? "border-(--ochre)" : "border-(--line)"}`}
              >
                <div
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none ${
                    isMine ? "bg-(--ochre)/25" : "bg-(--surface-3)"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="min-w-0 font-semibold break-words text-(--ink)">
                    {opt.label}
                    {isMine && (
                      <span className="ml-2 text-sm font-medium text-(--ochre)">
                        Tu voto
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[0.9375rem] text-(--ink) tabular-nums">
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
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-(--radius-sm) border bg-(--surface-2) px-5 py-4 text-left text-lg font-semibold text-(--ink) transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-(--muted) hover:bg-(--surface-3) disabled:cursor-default motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${isPending ? "border-(--ochre) ring-2 ring-(--ochre)" : "border-(--line-strong) disabled:opacity-50"}`}
              >
                <span className="min-w-0 break-words">{opt.label}</span>
                {isPending && (
                  <span className="shrink-0 font-mono text-sm font-medium text-(--ochre)">
                    Enviando…
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {votedOptionId && (
        <p
          className="mt-6 border-t border-(--line) pt-5 text-center font-mono text-[0.9375rem] text-(--muted) tabular-nums"
          role="status"
        >
          {totalForQuestion} respuesta{totalForQuestion !== 1 && "s"} hasta
          ahora
        </p>
      )}
    </div>
  );
}

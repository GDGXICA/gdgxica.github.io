import { useState } from "react";
import { TYPE_COLORS, TYPE_LABELS } from "../minigame-templates/types";
import {
  MODE_LABELS,
  STATE_COLORS,
  STATE_LABELS,
  type InstanceState,
  type MinigameInstance,
} from "./types";

interface Props {
  instance: MinigameInstance;
  onSetState: (state: InstanceState) => Promise<void> | void;
  onAdvanceQuiz: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  busy: boolean;
  // PR5: opens the moderation/winners side panel for global games.
  // Optional so admin tests of the card itself don't need to wire it.
  onOpenModeration?: () => void;
}

function questionCount(instance: MinigameInstance): number {
  if (instance.type !== "quiz") return 0;
  const questions = (instance.config?.questions as unknown[] | undefined) ?? [];
  return questions.length;
}

export function InstanceCard({
  instance,
  onSetState,
  onAdvanceQuiz,
  onDelete,
  busy,
  onOpenModeration,
}: Props) {
  const moderationLabel =
    instance.type === "wordcloud"
      ? "Ver moderación"
      : instance.type === "bingo"
        ? "Ver ganadores"
        : null;
  const moderationVisible =
    moderationLabel !== null &&
    instance.state !== "scheduled" &&
    onOpenModeration;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isQuiz = instance.type === "quiz";
  const totalQuestions = questionCount(instance);
  const currentQ =
    instance.currentQuestionIndex !== undefined &&
    instance.currentQuestionIndex >= 0
      ? instance.currentQuestionIndex + 1
      : 0;
  const isOnLastQuestion = isQuiz && currentQ >= totalQuestions;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[instance.type]}`}
            >
              {TYPE_LABELS[instance.type]}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_COLORS[instance.state]}`}
              data-testid="state-badge"
            >
              {STATE_LABELS[instance.state]}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {MODE_LABELS[instance.mode]}
            </span>
          </div>
          <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
            {instance.title}
          </h3>
          {isQuiz && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Pregunta {currentQ} de {totalQuestions}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
        {instance.state === "scheduled" && (
          <>
            <button
              type="button"
              onClick={() => onSetState("live")}
              disabled={busy}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              ▶ Iniciar
            </button>
            {!confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                🗑 Eliminar
              </button>
            )}
            {confirmDelete && (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onDelete();
                    setConfirmDelete(false);
                  }}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
              </span>
            )}
          </>
        )}

        {instance.state === "live" && (
          <>
            <button
              type="button"
              onClick={() => onSetState("closed")}
              disabled={busy}
              className="rounded-lg bg-gray-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              ⏹ Cerrar
            </button>
            {isQuiz && (
              <button
                type="button"
                onClick={() => onAdvanceQuiz()}
                disabled={busy || isOnLastQuestion}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                ⏭ Avanzar pregunta
              </button>
            )}
          </>
        )}

        {instance.state === "closed" && (
          <button
            type="button"
            onClick={() => onSetState("live")}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            ↻ Reabrir
          </button>
        )}

        {moderationVisible && (
          <button
            type="button"
            onClick={onOpenModeration}
            className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {moderationLabel}
          </button>
        )}
      </div>
    </div>
  );
}

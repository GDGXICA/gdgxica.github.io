import { useState } from "react";
import { TYPE_LABELS } from "../admin/minigame-templates/types";
import type { LiveInstance, MinigameType } from "./types";

/** Each game type as a category code: a coloured dot, never a filled chip. */
export const TYPE_DOTS: Record<MinigameType, string> = {
  poll: "var(--g-blue)",
  quiz: "var(--g-red)",
  wordcloud: "var(--g-yellow)",
  bingo: "var(--g-green)",
  roulette: "var(--ochre)",
};

interface Props {
  liveInstances: LiveInstance[];
  defaultAlias?: string;
  onSubmit: (alias: string) => Promise<{ success: boolean; error?: string }>;
  onDismiss: () => void;
}

const ALIAS_MAX = 24;

function isLocallyClean(alias: string): boolean {
  const normalized = alias
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!normalized) return false;
  const blockers = ["fuck", "shit", "puta", "puto", "mierda", "bitch"];
  return !blockers.some((b) => normalized.includes(b));
}

export function JoinModal({
  liveInstances,
  defaultAlias = "",
  onSubmit,
  onDismiss,
}: Props) {
  const [alias, setAlias] = useState(defaultAlias);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = alias.trim();
  const aliasOk = trimmed.length > 0 && trimmed.length <= ALIAS_MAX;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!aliasOk) {
      setError(`El alias debe tener entre 1 y ${ALIAS_MAX} caracteres`);
      return;
    }
    if (!isLocallyClean(trimmed)) {
      setError("Por favor, elige un alias respetuoso");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await onSubmit(trimmed);
    if (!res.success) {
      setError(res.error || "No pudimos conectarte. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
    >
      <button
        type="button"
        aria-label="Cerrar haciendo clic fuera"
        className="fixed inset-0 cursor-default bg-(--night)/85"
        onClick={onDismiss}
      />
      <div className="n-panel n-marks relative z-10 w-full max-w-md shadow-[0_30px_80px_-24px_rgb(0_0_0/0.7)]">
        <div className="px-6 pt-7">
          <h2
            id="join-modal-title"
            className="m-0 font-(family-name:--font-display) text-[2rem] leading-none font-bold tracking-[-0.01em] text-(--ink)"
          >
            Únete con un alias
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-6 text-(--muted)">
            Así te verán en la clasificación y en la pantalla del evento.
          </p>
        </div>

        <div className="space-y-5 px-6 pt-5 pb-6">
          {liveInstances.length > 0 && (
            <div>
              <ul className="flex flex-wrap gap-2">
                {liveInstances.map((inst) => (
                  <li
                    key={inst.id}
                    className="inline-flex min-h-7 items-center gap-2 rounded-(--radius-sm) border border-(--line-strong) px-2.5 py-1 text-sm text-(--ink)"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: TYPE_DOTS[inst.type] }}
                      aria-hidden="true"
                    />
                    {TYPE_LABELS[inst.type]} · {inst.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <label className="block">
              <span className="mb-2 block text-[0.9375rem] font-medium text-(--ink)">
                Tu alias
              </span>
              <input
                type="text"
                value={alias}
                maxLength={ALIAS_MAX}
                onChange={(e) => {
                  setAlias(e.target.value);
                  setError(null);
                }}
                placeholder="ej. Ana"
                autoFocus
                className="min-h-12 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface-2) px-4 py-3 text-base text-(--ink) transition-colors placeholder:text-(--muted)/70 hover:border-(--muted) focus:border-(--ochre)"
              />
              <span className="mt-2 block text-sm text-(--muted)">
                {trimmed.length}/{ALIAS_MAX} caracteres. No se puede cambiar
                después.
              </span>
            </label>

            {error && (
              <p
                className="border-l-2 border-red-400 pl-3 text-sm text-red-200"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="nb nb--ghost"
              >
                <span className="nb__label">Cerrar</span>
              </button>
              <button
                type="submit"
                disabled={submitting || !aliasOk}
                className="nb nb--primary grow sm:grow-0"
              >
                <span className="nb__label">
                  {submitting ? "Conectando..." : "Conectarme"}
                </span>
                <span className="nb__icon nb__icon--arrow" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { TYPE_COLORS, TYPE_LABELS } from "../admin/minigame-templates/types";
import type { LiveInstance } from "./types";

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
        className="fixed inset-0 cursor-default bg-black/60"
        onClick={onDismiss}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-20px_rgba(0,0,0,.5)] dark:bg-gray-900">
        <div className="flex h-1.5" aria-hidden="true">
          <span className="bg-google-blue flex-1" />
          <span className="bg-google-red flex-1" />
          <span className="bg-google-yellow flex-1" />
          <span className="bg-google-green flex-1" />
        </div>
        <div className="px-6 pt-6">
          <h2
            id="join-modal-title"
            className="text-2xl leading-tight font-bold text-gray-900 dark:text-white"
          >
            Únete con un alias
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Así te verán en la clasificación y en la pantalla del evento.
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          {liveInstances.length > 0 && (
            <div>
              <ul className="flex flex-wrap gap-2">
                {liveInstances.map((inst) => (
                  <li
                    key={inst.id}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[inst.type]}`}
                  >
                    {TYPE_LABELS[inst.type]} · {inst.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                className="focus-visible:outline-google-blue min-h-12 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
              />
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                {trimmed.length}/{ALIAS_MAX} caracteres. No se puede cambiar
                después.
              </span>
            </label>

            {error && (
              <p
                className="text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="focus-visible:outline-google-blue min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={submitting || !aliasOk}
                className="bg-google-blue focus-visible:outline-google-blue min-h-11 rounded-lg px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                {submitting ? "Conectando..." : "Conectarme"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

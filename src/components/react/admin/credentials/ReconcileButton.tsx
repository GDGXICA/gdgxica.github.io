import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  slug: string;
  onError: (message: string) => void;
}

interface Summary {
  matched: number;
  unmatchedCredentials: number;
  unmatchedRoster: number;
  ambiguous: number;
}

/**
 * Cross-references the credentials with the imported Bevy roster.
 *
 * Run it after each roster import. It is idempotent, so pressing it twice
 * is harmless — rows already reconciled are skipped rather than rewritten.
 *
 * Two things come out of it: the DNI lands on the check-in row so a
 * volunteer can compare it against the document at the door, and
 * `pending` stops meaning "nobody clicked yet" and starts meaning "not in
 * the official panel".
 */
export function ReconcileButton({ slug, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const run = async () => {
    setBusy(true);
    setSummary(null);
    const res = await api.reconcileCredentials(slug);
    setBusy(false);

    if (!res.success || !res.data) {
      onError(res.error ?? "No se pudo conciliar con el roster");
      return;
    }
    setSummary(res.data);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="border-gray-custom text-secondary rounded border px-3 py-2 text-sm disabled:opacity-50"
        title="Cruza las credenciales con el roster importado de Bevy"
      >
        {busy ? "Conciliando…" : "Conciliar con Bevy"}
      </button>

      {summary && (
        <div className="text-tertiary text-right text-xs">
          <p>
            {summary.matched} emparejada(s) · {summary.unmatchedCredentials} sin
            inscripción · {summary.unmatchedRoster} solo en Bevy
          </p>
          {summary.ambiguous > 0 && (
            <p className="text-[#92400E]">
              {summary.ambiguous} correo(s) repetidos: revísalos a mano, no se
              emparejaron
            </p>
          )}
        </div>
      )}
    </div>
  );
}

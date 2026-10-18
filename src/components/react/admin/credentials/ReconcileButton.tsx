import { useState } from "react";
import { api } from "@/lib/api";
import { buttonClass } from "../ui/atlas";

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

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

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
      onError(
        res.error ??
          "No se pudo cruzar con el roster de Bevy. Revisa que el roster esté importado y vuelve a intentarlo."
      );
      return;
    }
    setSummary(res.data);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-start">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={buttonClass.secondary}
      >
        {busy ? "Conciliando…" : "Conciliar con Bevy"}
      </button>

      <div className="text-sm">
        <p className="text-atlas-mist">
          Cruza las credenciales con el roster importado de Bevy. Hazlo después
          de cada importación; repetirlo no cambia lo ya cruzado.
        </p>
        {summary && (
          <div role="status" className="mt-2">
            <p className="text-atlas-dust tabular-nums">
              {count(summary.matched, "emparejada", "emparejadas")} ·{" "}
              {summary.unmatchedCredentials} sin inscripción en Bevy ·{" "}
              {summary.unmatchedRoster} solo en Bevy
            </p>
            {summary.ambiguous > 0 && (
              <p className="text-atlas-glow mt-1">
                {count(
                  summary.ambiguous,
                  "correo repetido",
                  "correos repetidos"
                )}{" "}
                en el roster: no se emparejaron, revísalos a mano.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

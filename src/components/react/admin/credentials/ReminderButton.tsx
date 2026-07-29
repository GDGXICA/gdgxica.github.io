import { useState } from "react";
import { api } from "@/lib/api";
import type { Credential } from "./types";

interface Props {
  slug: string;
  credentials: Credential[];
  onError: (message: string) => void;
}

/**
 * Who a reminder would reach.
 *
 * Still missing from the official panel, and already reached once — if the
 * credential email never went out, the problem is the send, not the
 * registration, and the retry button is the right tool.
 */
export function reminderRecipients(credentials: Credential[]): Credential[] {
  return credentials
    .filter((c) => c.bevyStatus === "pending" && c.emailStatus === "sent")
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

/**
 * Manual reminder, with the recipient list shown before anything is sent.
 *
 * Deliberately not a scheduled sweep. `bevyStatus` only leaves `pending`
 * when someone marks it or reconciliation matches it, so an automatic run
 * would email people who registered on the official panel themselves.
 * Telling someone they are not registered when they are costs more trust
 * than saying nothing at all — so a human looks at the list first.
 */
export function ReminderButton({ slug, credentials, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const recipients = reminderRecipients(credentials);

  const send = async () => {
    setBusy(true);
    const res = await api.sendCredentialReminders(
      slug,
      recipients.map((c) => c.id)
    );
    setBusy(false);

    if (!res.success) {
      onError(res.error ?? "No se pudieron encolar los recordatorios");
      return;
    }
    const { queued = 0, skipped = 0 } = res.data ?? {};
    setResult(
      skipped > 0
        ? `${queued} recordatorio(s) encolados. ${skipped} se omitieron porque ya estaban cargados.`
        : `${queued} recordatorio(s) encolados.`
    );
    setOpen(false);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={recipients.length === 0}
        className="border-gray-custom text-secondary rounded border px-3 py-2 text-sm disabled:opacity-50"
      >
        Recordar inscripción ({recipients.length})
      </button>

      {result && <p className="text-tertiary text-xs">{result}</p>}

      {open && (
        <div className="border-gray-custom w-full max-w-md rounded-lg border bg-white p-4 shadow-lg">
          <p className="text-primary text-sm font-semibold">
            Se enviará a {recipients.length} persona(s)
          </p>
          <p className="text-secondary mt-1 text-xs">
            Solo a quienes siguen sin aparecer en el panel oficial. Revisa la
            lista antes de confirmar.
          </p>

          <ul className="border-gray-custom my-3 max-h-56 overflow-y-auto rounded border text-sm">
            {recipients.map((c) => (
              <li
                key={c.id}
                className="border-gray-custom flex justify-between gap-2 border-b px-3 py-1.5 last:border-b-0"
              >
                <span className="truncate">
                  #{c.sequenceNumber} {c.firstName} {c.lastName}
                </span>
                <span className="text-tertiary truncate">{c.email}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-tertiary px-3 py-1 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className="bg-google-blue rounded px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Encolando…" : "Confirmar envío"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

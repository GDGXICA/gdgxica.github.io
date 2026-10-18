import { useState } from "react";
import { api } from "@/lib/api";
import { CornerNodes, buttonClass } from "../ui/atlas";
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

const people = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;

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
      onError(
        res.error ??
          "No se pudieron encolar los recordatorios. No se envió ninguno: vuelve a intentarlo."
      );
      return;
    }
    const { queued = 0, skipped = 0 } = res.data ?? {};
    const queuedText =
      queued === 1
        ? "1 recordatorio en cola."
        : `${queued} recordatorios en cola.`;
    setResult(
      skipped > 0
        ? `${queuedText} ${people(skipped)} se ${skipped === 1 ? "omitió" : "omitieron"} porque ya estaba${skipped === 1 ? "" : "n"} en Bevy.`
        : queuedText
    );
    setOpen(false);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={recipients.length === 0}
        aria-expanded={open}
        className={buttonClass.secondary}
      >
        Recordar inscripción
        <span className="text-atlas-mist tabular-nums">
          {recipients.length}
        </span>
      </button>

      <div className="text-sm">
        <p className="text-atlas-mist">
          {recipients.length === 0
            ? "Ahora no hay a quién recordar: quienes recibieron su credencial ya están en Bevy."
            : "Escribe a quienes ya recibieron su credencial y siguen sin aparecer en el panel oficial. Verás la lista antes de enviar."}
        </p>
        {result && (
          <p role="status" className="text-atlas-dust mt-2">
            {result}
          </p>
        )}
      </div>

      {open && (
        <div className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 sm:col-span-2">
          <CornerNodes />
          <p className="text-atlas-dust font-semibold">
            Se enviará a {people(recipients.length)}
          </p>
          <p className="text-atlas-mist mt-1 text-sm">
            Solo a quienes siguen sin aparecer en el panel oficial. Revisa la
            lista antes de confirmar.
          </p>

          <ul className="border-atlas-line bg-atlas-night my-4 max-h-56 overflow-y-auto rounded-xs border text-sm">
            {recipients.map((c) => (
              <li
                key={c.id}
                className="border-atlas-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b px-4 py-2 last:border-b-0"
              >
                <span className="text-atlas-dust min-w-0 truncate">
                  <span className="text-atlas-fog tabular-nums">
                    #{c.sequenceNumber}
                  </span>{" "}
                  {c.firstName} {c.lastName}
                </span>
                <span className="text-atlas-fog min-w-0 truncate">
                  {c.email}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={buttonClass.quiet}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className={buttonClass.primary}
            >
              {busy
                ? "Encolando…"
                : recipients.length === 1
                  ? "Enviar 1 recordatorio"
                  : `Enviar ${recipients.length} recordatorios`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

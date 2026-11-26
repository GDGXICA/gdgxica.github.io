import { useState } from "react";
import type { CertificateItem, CertificatePersonPatch } from "@/lib/api";
import { isValidEmail } from "@/lib/email";
import { Tag, buttonClass, inputClass } from "../ui/atlas";
import { CHECKIN, STATUS } from "./kinds";
import { formatMoment } from "./format";

export type RowAction =
  | { type: "send"; resend?: boolean }
  | { type: "cancel" }
  | { type: "preview" }
  | { type: "remove" }
  | { type: "patch"; patch: CertificatePersonPatch };

interface Props {
  item: CertificateItem;
  busy: boolean;
  /** False until the certificate data is saved. */
  canSend: boolean;
  onAction: (action: RowAction) => void;
}

const quiet = `${buttonClass.quiet} disabled:opacity-50`;

/**
 * One person and their certificate: who, where it went, and the one or
 * two things that can be done with it from where it stands.
 */
export function CertificateRow({ item, busy, canSend, onAction }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);
  const status = STATUS[item.status];
  const attendee = item.kind === "attendee";
  const registered = item.source === "registered";
  const noCheckin = attendee && !item.checkin;

  return (
    <li className="border-atlas-line border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-atlas-dust truncate font-semibold">
            {item.name || "Sin nombre"}
          </p>
          <p className="text-atlas-fog truncate text-sm">
            {item.email}
            {item.kind === "volunteer" && item.hours ? (
              <span className="tabular-nums"> · {item.hours} h</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {attendee && item.checkin && <Tag>{CHECKIN[item.checkin]}</Tag>}
          {noCheckin && (
            <Tag tone="border-atlas-rose/50 text-atlas-rose">Sin check-in</Tag>
          )}
          <Tag tone={status.tone}>
            {status.label}
            {item.status === "sent" && item.sentAt ? (
              <span className="font-normal">
                {" "}
                · {formatMoment(item.sentAt)}
              </span>
            ) : null}
          </Tag>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          {(item.status === "pending" || item.status === "cancelled") &&
            !noCheckin && (
              <button
                type="button"
                className={buttonClass.secondary}
                disabled={busy || !canSend}
                onClick={() => onAction({ type: "send" })}
              >
                Enviar
              </button>
            )}
          {item.status === "failed" && (
            <button
              type="button"
              className={buttonClass.secondary}
              disabled={busy || !canSend}
              onClick={() => onAction({ type: "send" })}
            >
              Reintentar
            </button>
          )}
          {item.status === "queued" && (
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => onAction({ type: "cancel" })}
            >
              Cancelar envío
            </button>
          )}
          {item.status === "sent" && (
            <button
              type="button"
              className={quiet}
              disabled={busy || !canSend}
              onClick={() => setConfirmResend(true)}
            >
              Reenviar
            </button>
          )}
          {item.status === "excluded" ? (
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() =>
                onAction({
                  type: "patch",
                  patch: {
                    excluded: false,
                    rosterId: item.rosterId ?? undefined,
                  },
                })
              }
            >
              Restaurar
            </button>
          ) : (
            item.status !== "sending" &&
            item.status !== "queued" && (
              <>
                <button
                  type="button"
                  className={quiet}
                  disabled={busy}
                  aria-expanded={editing}
                  onClick={() => setEditing((e) => !e)}
                >
                  Corregir
                </button>
                <button
                  type="button"
                  className={quiet}
                  disabled={busy}
                  onClick={() => onAction({ type: "preview" })}
                >
                  Ver PDF
                </button>
                {attendee && item.status !== "sent" && (
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() =>
                      onAction({
                        type: "patch",
                        patch: {
                          excluded: true,
                          rosterId: item.rosterId ?? undefined,
                        },
                      })
                    }
                  >
                    Excluir
                  </button>
                )}
                {registered && item.status !== "sent" && (
                  <button
                    type="button"
                    className={`${quiet} hover:text-atlas-rose`}
                    disabled={busy}
                    onClick={() => onAction({ type: "remove" })}
                  >
                    Quitar
                  </button>
                )}
              </>
            )
          )}
        </div>
      </div>

      {item.status === "failed" && item.lastError && (
        <p className="text-atlas-rose mt-2 text-sm break-words">
          No salió tras {item.attempts}{" "}
          {item.attempts === 1 ? "intento" : "intentos"}: {item.lastError}
        </p>
      )}
      {item.status === "queued" && item.lastError && (
        <p className="text-atlas-glow mt-2 text-sm break-words">
          Se reintentará solo. Último error: {item.lastError}
        </p>
      )}
      {item.status === "cancelled" && item.lastError && (
        <p className="text-atlas-fog mt-2 text-sm">{item.lastError}</p>
      )}

      {confirmResend && (
        <div
          role="group"
          aria-label="Confirmar reenvío"
          className="border-atlas-line bg-atlas-deep/40 mt-3 flex flex-wrap items-center gap-3 rounded-xs border px-4 py-3 text-sm"
        >
          <span className="text-atlas-dust flex-1">
            {item.name} ya recibió su certificado. ¿Lo envías otra vez a{" "}
            {item.email}?
          </span>
          <button
            type="button"
            className={buttonClass.quiet}
            onClick={() => setConfirmResend(false)}
          >
            No
          </button>
          <button
            type="button"
            className={buttonClass.secondary}
            disabled={busy}
            onClick={() => {
              setConfirmResend(false);
              onAction({ type: "send", resend: true });
            }}
          >
            Sí, reenviar
          </button>
        </div>
      )}

      {editing && (
        <EditPerson
          item={item}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            setEditing(false);
            onAction({ type: "patch", patch });
          }}
        />
      )}
    </li>
  );
}

function EditPerson({
  item,
  busy,
  onCancel,
  onSave,
}: {
  item: CertificateItem;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: CertificatePersonPatch) => void;
}) {
  const [firstName, setFirstName] = useState(item.firstName);
  const [lastName, setLastName] = useState(item.lastName);
  const [email, setEmail] = useState(item.email);
  const [hours, setHours] = useState(item.hours ? String(item.hours) : "");
  const [error, setError] = useState<string | null>(null);
  const volunteer = item.kind === "volunteer";

  const save = () => {
    if (!firstName.trim()) return setError("Falta el nombre.");
    if (!isValidEmail(email)) return setError("Este correo no es válido.");
    const h = hours.trim() ? Number(hours) : null;
    if (h !== null && !(h > 0 && h <= 500))
      return setError("Las horas deben ser un número mayor que 0.");
    onSave({
      rosterId: item.rosterId ?? undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      ...(volunteer ? { hours: h } : {}),
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="border-atlas-line bg-atlas-deep/40 mt-3 rounded-xs border p-4"
    >
      <p className="text-atlas-mist mb-3 text-sm">
        {item.kind === "attendee"
          ? "Solo cambia el certificado: el registro de Bevy queda como está."
          : "Así saldrá en el certificado y a este correo llegará."}
      </p>
      <div
        className={`grid grid-cols-1 gap-2 ${volunteer ? "sm:grid-cols-[1fr_1fr_1.3fr_5.5rem]" : "sm:grid-cols-[1fr_1fr_1.3fr]"}`}
      >
        <input
          aria-label="Nombres"
          className={inputClass}
          value={firstName}
          maxLength={100}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          aria-label="Apellidos"
          className={inputClass}
          value={lastName}
          maxLength={100}
          onChange={(e) => setLastName(e.target.value)}
        />
        <input
          aria-label="Correo"
          type="email"
          className={inputClass}
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
        />
        {volunteer && (
          <input
            aria-label="Horas"
            type="number"
            min="0"
            step="0.25"
            className={inputClass}
            value={hours}
            placeholder="Evento"
            onChange={(e) => setHours(e.target.value)}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-atlas-rose mt-2 text-sm">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={buttonClass.quiet} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={buttonClass.secondary} disabled={busy}>
          Guardar
        </button>
      </div>
    </form>
  );
}

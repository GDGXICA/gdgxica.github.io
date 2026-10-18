import { useId, useState } from "react";
import { api } from "@/lib/api";
import { buttonClass, inputClass } from "../ui/atlas";
import { maskDni } from "./maskDni";
import {
  BEVY_STATUS_LABEL,
  EMAIL_STATUS_LABEL,
  type BevyStatus,
  type Credential,
} from "./types";

interface Props {
  slug: string;
  credentials: Credential[];
  conflicts: Set<string>;
  onError: (message: string) => void;
  emptyMessage?: string;
}

const fieldButtonClass =
  "text-atlas-mist hover:bg-atlas-deep hover:text-atlas-dust shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold transition-colors";

/**
 * A single field with a copy button.
 *
 * The person working this queue is racing Bevy's 15-minute session
 * timeout, so every value they must retype is a field-level copy target
 * rather than something to select by hand out of a modal. That is the
 * whole ergonomic premise of this screen.
 */
function CopyField({
  label,
  value,
  masked,
  className = "",
}: {
  label: string;
  value: string;
  masked?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const hidden = masked && !revealed;
  const shown = hidden ? maskDni(value) : value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked; the value is on screen either way.
    }
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <span className="atlas-label text-atlas-fog block">{label}</span>
      <div
        className={`mt-1 flex min-w-0 items-center gap-1 ${masked ? "flex-wrap" : ""}`}
      >
        <span
          className={`min-w-0 text-[0.9375rem] ${
            masked ? "tabular-nums" : "truncate"
          } ${shown ? "text-atlas-dust" : "text-atlas-fog"}`}
          title={hidden ? undefined : value}
        >
          {shown || "—"}
        </span>
        {masked && value && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className={fieldButtonClass}
            aria-label={revealed ? "Ocultar DNI" : "Mostrar DNI"}
          >
            {revealed ? "Ocultar" : "Ver"}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={copy}
            className={`${fieldButtonClass} ${copied ? "text-atlas-ok" : ""}`}
            aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

function Tag({
  children,
  tone = "border-atlas-line text-atlas-mist",
  title,
}: {
  children: React.ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <span
      className={`rounded-xs border px-1.5 py-0.5 text-xs font-semibold ${tone}`}
      title={title}
    >
      {children}
    </span>
  );
}

function CredentialRow({
  credential: c,
  conflict,
  busy,
  ticket,
  onTicket,
  onStatus,
}: {
  credential: Credential;
  conflict: boolean;
  busy: boolean;
  ticket: string;
  onTicket: (value: string) => void;
  onStatus: (status: BevyStatus) => void;
}) {
  const ticketId = useId();
  const name = `${c.firstName} ${c.lastName}`.trim();

  return (
    <li className="border-atlas-line border-b py-5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="text-atlas-fog text-sm tabular-nums">
          #{c.sequenceNumber}
        </span>
        <span className="atlas-name text-atlas-dust min-w-0 text-xl leading-tight break-words">
          {name || "Sin nombre"}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {c.groupLetter && <Tag>Grupo {c.groupLetter}</Tag>}
          {c.bevyStatus === "pending" ? (
            <span className="text-atlas-fog text-xs font-semibold">
              {BEVY_STATUS_LABEL[c.bevyStatus]}
            </span>
          ) : (
            <Tag>{BEVY_STATUS_LABEL[c.bevyStatus]}</Tag>
          )}
          {conflict && (
            <Tag
              tone="border-atlas-glow/40 text-atlas-glow"
              title="Otro registro declara el mismo DNI. No se bloquea: revísalo antes de cargar."
            >
              DNI repetido
            </Tag>
          )}
          {c.emailStatus === "failed" && (
            <Tag tone="border-atlas-rose/40 text-atlas-rose">
              Correo: {EMAIL_STATUS_LABEL[c.emailStatus].toLowerCase()}
            </Tag>
          )}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_12.5rem]">
        <CopyField label="Nombre" value={c.firstName} />
        <CopyField label="Apellido" value={c.lastName} />
        <CopyField
          label="Correo"
          value={c.email}
          className="col-span-2 @4xl:col-span-1"
        />
        <CopyField label="Empresa" value={c.company} />
        <CopyField label="DNI" value={c.dni} masked />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor={ticketId} className="sr-only">
          Número de ticket de Bevy de {name || `#${c.sequenceNumber}`}
        </label>
        <input
          id={ticketId}
          type="text"
          value={ticket}
          onChange={(e) => onTicket(e.target.value)}
          placeholder="N.º de ticket de Bevy"
          className={`${inputClass} sm:w-56`}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus("loaded")}
          className={buttonClass.secondary}
        >
          {busy ? "Guardando…" : "Marcar cargado"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus("not_found")}
          className={`${buttonClass.quiet} disabled:opacity-50`}
        >
          No encontrado
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus("discarded")}
          className={`${buttonClass.quiet} disabled:opacity-50`}
        >
          Descartar
        </button>
        {c.bevyStatus !== "pending" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("pending")}
            className={`${buttonClass.quiet} disabled:opacity-50`}
          >
            Volver a pendiente
          </button>
        )}
      </div>
    </li>
  );
}

export function BevyQueue({
  slug,
  credentials,
  conflicts,
  onError,
  emptyMessage = "No hay inscripciones en esta vista.",
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Record<string, string>>({});

  const setStatus = async (credential: Credential, status: BevyStatus) => {
    setBusyId(credential.id);
    const res = await api.setCredentialBevyStatus(slug, credential.id, {
      status,
      ticketNumber: tickets[credential.id]?.trim() || null,
      note: null,
    });
    setBusyId(null);
    if (!res.success) {
      onError(
        res.error ??
          `No se pudo guardar el estado de ${credential.firstName} ${credential.lastName}. Inténtalo de nuevo.`
      );
    }
  };

  if (credentials.length === 0) {
    return (
      <p className="border-atlas-line text-atlas-mist mt-4 rounded-xs border border-dashed px-5 py-8 text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul>
      {credentials.map((c) => (
        <CredentialRow
          key={c.id}
          credential={c}
          conflict={conflicts.has(c.id)}
          busy={busyId === c.id}
          ticket={tickets[c.id] ?? c.bevyTicketNumber ?? ""}
          onTicket={(value) => setTickets((t) => ({ ...t, [c.id]: value }))}
          onStatus={(status) => setStatus(c, status)}
        />
      ))}
    </ul>
  );
}

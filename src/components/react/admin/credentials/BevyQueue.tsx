import { useState } from "react";
import { api } from "@/lib/api";
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
}

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
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const shown = masked && !revealed ? maskDni(value) : value;

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
    <div className="flex min-w-0 flex-col">
      <span className="text-tertiary text-[11px] tracking-wide uppercase">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span className="truncate font-mono text-sm" title={value}>
          {shown || "—"}
        </span>
        {masked && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="text-tertiary shrink-0 text-xs hover:underline"
            aria-label={revealed ? "Ocultar DNI" : "Mostrar DNI"}
          >
            {revealed ? "ocultar" : "ver"}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={copy}
            className="text-google-blue shrink-0 text-xs hover:underline"
            aria-label={`Copiar ${label}`}
          >
            {copied ? "copiado" : "copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

export function BevyQueue({ slug, credentials, conflicts, onError }: Props) {
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
      onError(res.error ?? "No se pudo actualizar el estado");
    }
  };

  if (credentials.length === 0) {
    return (
      <p className="text-secondary py-8 text-center text-sm">
        No hay credenciales en esta vista.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {credentials.map((c) => (
        <li
          key={c.id}
          className="border-gray-custom rounded-lg border bg-white p-4"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="bg-section text-secondary rounded px-2 py-0.5 font-mono text-xs">
              #{c.sequenceNumber}
            </span>
            <span className="bg-google-blue rounded px-2 py-0.5 text-xs font-bold text-white">
              {c.groupLetter}
            </span>
            <span className="text-primary font-semibold">
              {c.firstName} {c.lastName}
            </span>
            {conflicts.has(c.id) && (
              <span
                className="rounded bg-[#FEF3C7] px-2 py-0.5 text-xs text-[#92400E]"
                title="Otro registro declara el mismo DNI. No se bloquea: revísalo antes de cargar."
              >
                DNI duplicado
              </span>
            )}
            <span className="text-tertiary text-xs">
              {BEVY_STATUS_LABEL[c.bevyStatus]}
            </span>
            {c.emailStatus === "failed" && (
              <span className="rounded bg-[#FEE2E2] px-2 py-0.5 text-xs text-[#991B1B]">
                Correo: {EMAIL_STATUS_LABEL[c.emailStatus]}
              </span>
            )}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <CopyField label="Nombre" value={c.firstName} />
            <CopyField label="Apellido" value={c.lastName} />
            <CopyField label="Correo" value={c.email} />
            <CopyField label="Empresa" value={c.company} />
            <CopyField label="DNI" value={c.dni} masked />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={tickets[c.id] ?? c.bevyTicketNumber ?? ""}
              onChange={(e) =>
                setTickets((t) => ({ ...t, [c.id]: e.target.value }))
              }
              placeholder="N.º de ticket de Bevy"
              className="border-gray-custom rounded border px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => setStatus(c, "loaded")}
              className="bg-google-green rounded px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              Marcar cargado
            </button>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => setStatus(c, "not_found")}
              className="border-gray-custom text-secondary rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              No encontrado
            </button>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => setStatus(c, "discarded")}
              className="border-gray-custom text-secondary rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              Descartar
            </button>
            {c.bevyStatus !== "pending" && (
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => setStatus(c, "pending")}
                className="text-tertiary px-2 py-1 text-sm hover:underline disabled:opacity-50"
              >
                Volver a pendiente
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

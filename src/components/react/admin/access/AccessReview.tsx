import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import { useAuth } from "../AuthProvider";
import {
  CornerNodes,
  ErrorState,
  LoadingState,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { useEventCatalog } from "../useEventCatalog";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { accessError, formatWhen, splitLinks } from "./copy";
import { RoleChoice } from "./RoleChoice";

/** Roles que se pueden pedir o invitar. `admin` se otorga siempre a mano. */
const ASSIGNABLE: Role[] = ["contributor", "volunteer", "organizer"];

const MAX_NOTE = 500;

type Status = "pending" | "approved" | "rejected";

const STATUS_TABS: { id: Status; label: string; empty: string }[] = [
  {
    id: "pending",
    label: "Pendientes",
    empty:
      "No hay solicitudes pendientes. Cuando alguien pida acceso, aparecerá aquí.",
  },
  {
    id: "approved",
    label: "Aprobadas",
    empty: "Todavía no se ha aprobado ninguna solicitud.",
  },
  {
    id: "rejected",
    label: "Rechazadas",
    empty: "No hay solicitudes rechazadas.",
  },
];

const destructiveClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-atlas-rose/50 px-4 py-2.5 text-sm font-semibold text-atlas-rose transition-colors hover:bg-atlas-rose/10 disabled:opacity-50";

const destructiveQuietClass =
  "rounded-md px-2 py-1.5 text-sm font-semibold text-atlas-rose transition-colors hover:bg-atlas-rose/10 disabled:opacity-50";

interface AccessRequest {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  requestedRole: string;
  motivo: string;
  links?: string;
  eventSlug?: string | null;
  status: string;
  createdAt?: { _seconds: number };
  reviewedAt?: { _seconds: number };
  reviewNote?: string;
  grantedRole?: string | null;
}

interface Invitation {
  id: string;
  emailLower: string;
  role: string;
  expiresAt?: { _seconds: number } | string;
  usedAt?: { _seconds: number } | null;
  revokedAt?: { _seconds: number } | null;
  createdAt?: { _seconds: number };
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "object" && "_seconds" in (value as object)) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  const parsed = new Date(value as string).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return "sin rol";
  return ROLE_LABELS[role as Role] ?? role;
}

function personName(req: AccessRequest): string {
  return req.displayName?.trim() || req.email;
}

/** Estado de una invitación: caducada y usada se ven distinto. */
function invitationState(inv: Invitation): {
  label: string;
  tone: string;
  detail: string;
  open: boolean;
} {
  if (inv.usedAt)
    return {
      label: "Aceptada",
      tone: "text-atlas-ok",
      detail: `aceptada ${formatWhen(toMillis(inv.usedAt))}`,
      open: false,
    };
  if (inv.revokedAt)
    return {
      label: "Revocada",
      tone: "text-atlas-fog",
      detail: `revocada ${formatWhen(toMillis(inv.revokedAt))}`,
      open: false,
    };
  const expiresAt = toMillis(inv.expiresAt);
  if (expiresAt !== null && expiresAt < Date.now())
    return {
      label: "Caducada",
      tone: "text-atlas-fog",
      detail: `caducó ${formatWhen(expiresAt)}`,
      open: false,
    };
  return {
    label: "Pendiente",
    tone: "text-atlas-glow",
    detail: `caduca ${formatWhen(expiresAt)}`,
    open: true,
  };
}

function Links({ value }: { value: string }) {
  return (
    <p className="text-atlas-mist mt-2 text-sm break-all">
      {splitLinks(value).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-atlas-dust decoration-atlas-line hover:decoration-atlas-mist underline underline-offset-4"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  );
}

function DecisionPanel({
  req,
  approve,
  assignable,
  busy,
  onCancel,
  onConfirm,
}: {
  req: AccessRequest;
  approve: boolean;
  assignable: Role[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (role: string, note: string) => void;
}) {
  const requested = req.requestedRole as Role;
  const canGrantRequested = assignable.includes(requested);
  const [role, setRole] = useState<Role>(
    canGrantRequested ? requested : assignable[0]
  );
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const name = personName(req);
  const headingId = `decision-${req.uid}`;

  useEffect(() => {
    if (approve) panelRef.current?.focus();
    else noteRef.current?.focus();
  }, [approve]);

  const ready = note.trim().length > 0 && (!approve || Boolean(role));

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
      className="border-atlas-line bg-atlas-deep/40 relative mt-5 rounded-xs border p-5"
    >
      <CornerNodes />
      <p id={headingId} className="atlas-label text-atlas-glow">
        {approve ? "Aprobar solicitud" : "Rechazar solicitud"}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) onConfirm(role, note.trim());
        }}
        className="mt-4 space-y-5"
      >
        {approve ? (
          <>
            <p className="text-atlas-mist text-[0.9375rem] leading-relaxed">
              <span className="text-atlas-dust font-semibold">{name}</span>{" "}
              entrará al panel como{" "}
              <span className="text-atlas-dust font-semibold">
                {roleLabel(role)}
              </span>
              .
            </p>
            {!canGrantRequested && (
              <p className="text-atlas-glow text-sm">
                Pidió {roleLabel(requested)}, que tu cuenta no puede otorgar.
                Elige otro rol o deja la decisión a un administrador.
              </p>
            )}
            <RoleChoice
              legend="Rol que recibirá"
              name={`rol-${req.uid}`}
              roles={assignable}
              value={role}
              onChange={setRole}
              disabled={busy}
              note={(r) =>
                r === requested ? (
                  <span className="atlas-label text-atlas-glow">Lo pidió</span>
                ) : null
              }
            />
          </>
        ) : (
          <p className="text-atlas-mist text-[0.9375rem] leading-relaxed">
            <span className="text-atlas-dust font-semibold">{name}</span> no
            recibirá acceso. Pidió {roleLabel(requested)}; podrá volver a
            solicitarlo.
          </p>
        )}

        <div>
          <FormField
            label={approve ? `Nota para ${name}` : `Motivo para ${name}`}
            required
          >
            <textarea
              ref={noteRef}
              rows={3}
              maxLength={MAX_NOTE}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                approve
                  ? "Bienvenida, qué puede hacer primero…"
                  : "Por qué no esta vez y qué le ayudaría a la próxima"
              }
              className={inputClass}
            />
          </FormField>
          <p className="text-atlas-fog mt-1.5 text-sm">
            {approve
              ? "Le llega por correo y queda en la auditoría."
              : "Le llega por correo."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !ready}
            className={approve ? buttonClass.primary : destructiveClass}
          >
            {busy
              ? approve
                ? "Aprobando…"
                : "Rechazando…"
              : approve
                ? `Aprobar como ${roleLabel(role)}`
                : `Rechazar la solicitud de ${name}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={buttonClass.quiet}
          >
            Cancelar
          </button>
          {!ready && !busy && (
            <span className="text-atlas-fog text-sm">
              Falta: {approve ? "la nota" : "el motivo"}.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function RequestRow({
  req,
  eventName,
  decision,
  assignable,
  busy,
  onOpen,
  onCancel,
  onConfirm,
}: {
  req: AccessRequest;
  eventName: string | null;
  decision: "approve" | "reject" | null;
  assignable: Role[];
  busy: boolean;
  onOpen: (mode: "approve" | "reject") => void;
  onCancel: () => void;
  onConfirm: (approve: boolean, role: string, note: string) => void;
}) {
  const approveRef = useRef<HTMLButtonElement>(null);
  const name = personName(req);
  const created = toMillis(req.createdAt);
  const pending = req.status === "pending";

  return (
    <li className="border-atlas-line border-b py-5 last:border-b-0">
      <div className="grid gap-x-6 gap-y-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-start">
        <div className="min-w-0">
          <p className="atlas-name text-atlas-dust text-xl leading-tight break-words">
            {name}
          </p>
          <p className="text-atlas-mist mt-1 text-sm break-all">
            {req.displayName?.trim() ? `${req.email} · ` : ""}
            {created !== null ? (
              <time dateTime={new Date(created).toISOString()}>
                {formatWhen(created)}
              </time>
            ) : (
              "sin fecha"
            )}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="atlas-label text-atlas-fog">Pide</dt>
              <dd className="text-atlas-dust mt-0.5 font-semibold">
                {roleLabel(req.requestedRole)}
              </dd>
            </div>
            {req.eventSlug && (
              <div>
                <dt className="atlas-label text-atlas-fog">Evento</dt>
                <dd className="text-atlas-dust mt-0.5">
                  {eventName ?? req.eventSlug}
                </dd>
              </div>
            )}
            {req.status === "approved" && (
              <div>
                <dt className="atlas-label text-atlas-fog">Recibió</dt>
                <dd className="text-atlas-dust mt-0.5 font-semibold">
                  {roleLabel(req.grantedRole)}
                </dd>
              </div>
            )}
            {!pending && toMillis(req.reviewedAt) !== null && (
              <div>
                <dt className="atlas-label text-atlas-fog">Decidida</dt>
                <dd className="text-atlas-dust mt-0.5">
                  {formatWhen(toMillis(req.reviewedAt))}
                </dd>
              </div>
            )}
          </dl>

          <p className="atlas-label text-atlas-fog mt-4">Motivo</p>
          <p className="text-atlas-dust mt-1 max-w-[70ch] text-[0.9375rem] leading-relaxed whitespace-pre-line">
            {req.motivo}
          </p>
          {req.links && <Links value={req.links} />}

          {!pending && req.reviewNote && (
            <>
              <p className="atlas-label text-atlas-fog mt-4">
                {req.status === "approved" ? "Nota enviada" : "Motivo enviado"}
              </p>
              <p className="text-atlas-mist mt-1 max-w-[70ch] text-sm leading-relaxed whitespace-pre-line">
                {req.reviewNote}
              </p>
            </>
          )}
        </div>

        {pending && decision === null && (
          <div className="flex flex-wrap items-center gap-2 @3xl:justify-end">
            <button
              ref={approveRef}
              type="button"
              onClick={() => onOpen("approve")}
              disabled={busy}
              className={buttonClass.secondary}
            >
              Aprobar…
            </button>
            <button
              type="button"
              onClick={() => onOpen("reject")}
              disabled={busy}
              className={destructiveQuietClass}
            >
              Rechazar…
            </button>
          </div>
        )}
      </div>

      {pending && decision !== null && (
        <DecisionPanel
          req={req}
          approve={decision === "approve"}
          assignable={assignable}
          busy={busy}
          onCancel={() => {
            onCancel();
            requestAnimationFrame(() => approveRef.current?.focus());
          }}
          onConfirm={(role, note) =>
            onConfirm(decision === "approve", role, note)
          }
        />
      )}
    </li>
  );
}

export function AccessReview() {
  const { permissions } = useAuth();
  const { events } = useEventCatalog();

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status>("pending");
  const [loading, setLoading] = useState(true);
  const [requestsFailed, setRequestsFailed] = useState(false);
  const [invitationsFailed, setInvitationsFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    uid: string;
    mode: "approve" | "reject";
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("contributor");
  const [inviting, setInviting] = useState(false);

  // Solo se ofrecen los roles que quien revisa puede otorgar; la API vuelve
  // a comprobarlo, esto es para no enseñar opciones que darían 403.
  const assignable = ASSIGNABLE.filter((role) =>
    role === "organizer" ? permissions.has("events:write") : true
  );

  useEffect(() => {
    loadAll(statusFilter);
  }, [statusFilter]);

  async function loadAll(status: Status) {
    setLoading(true);
    setRequestsFailed(false);
    setInvitationsFailed(false);
    const [reqRes, invRes] = await Promise.all([
      api.listAccessRequests(status),
      api.listInvitations(),
    ]);
    if (reqRes.success && reqRes.data) {
      setRequests(reqRes.data as AccessRequest[]);
    } else {
      setRequestsFailed(true);
    }
    if (invRes.success && invRes.data) {
      setInvitations(invRes.data as Invitation[]);
    } else {
      setInvitationsFailed(true);
    }
    setLoading(false);
  }

  function eventName(slug: string | null | undefined): string | null {
    if (!slug) return null;
    return events?.find((e) => e.slug === slug)?.name ?? null;
  }

  async function decide(
    req: AccessRequest,
    approve: boolean,
    role: string,
    note: string
  ) {
    setBusy(req.uid);
    const res = await api.decideAccessRequest(req.uid, approve, note, role);
    const name = personName(req);
    if (res.success) {
      setRequests((prev) => prev.filter((r) => r.uid !== req.uid));
      setDecision(null);
      setToast({
        message: approve
          ? `${name} ya es ${roleLabel(role)}`
          : `Solicitud de ${name} rechazada`,
        type: "success",
      });
    } else {
      setToast({
        message: accessError(
          res.error,
          `No se pudo registrar la decisión sobre ${name}. Inténtalo de nuevo.`
        ),
        type: "error",
      });
    }
    setBusy(null);
  }

  async function sendInvitation(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    setInviting(true);
    const res = await api.createInvitation(email, inviteRole);
    if (res.success) {
      setInviteEmail("");
      setToast({
        message: `Invitación enviada a ${email} como ${roleLabel(inviteRole)}`,
        type: "success",
      });
      loadAll(statusFilter);
    } else {
      setToast({
        message: accessError(
          res.error,
          "No se pudo enviar la invitación. Inténtalo de nuevo."
        ),
        type: "error",
      });
    }
    setInviting(false);
  }

  async function revoke(inv: Invitation) {
    if (
      !confirm(
        `¿Revocar la invitación de ${inv.emailLower} como ${roleLabel(inv.role)}? El enlace que recibió dejará de funcionar.`
      )
    )
      return;
    setBusy(inv.id);
    const res = await api.revokeInvitation(inv.id);
    if (res.success) {
      setToast({
        message: `Invitación de ${inv.emailLower} revocada`,
        type: "success",
      });
      loadAll(statusFilter);
    } else {
      setToast({
        message: accessError(
          res.error,
          "No se pudo revocar la invitación. Inténtalo de nuevo."
        ),
        type: "error",
      });
    }
    setBusy(null);
  }

  const tab = STATUS_TABS.find((t) => t.id === statusFilter) ?? STATUS_TABS[0];
  const openInvitations = invitations.filter(
    (inv) => invitationState(inv).open
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="acceso-solicitudes" className="@container">
            <SectionHeading
              action={
                !loading &&
                !requestsFailed && (
                  <span className="text-atlas-fog text-sm tabular-nums">
                    {requests.length}{" "}
                    {requests.length === 1 ? "solicitud" : "solicitudes"}
                  </span>
                )
              }
            >
              <span id="acceso-solicitudes">{tab.label}</span>
            </SectionHeading>

            <div
              role="group"
              aria-label="Mostrar solicitudes"
              className="border-atlas-line mb-2 flex gap-5 border-b"
            >
              {STATUS_TABS.map((t) => {
                const active = t.id === statusFilter;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDecision(null);
                      setStatusFilter(t.id);
                    }}
                    className={`-mb-px border-b-2 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "border-atlas-star text-atlas-dust"
                        : "text-atlas-mist hover:text-atlas-dust border-transparent"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <LoadingState label="Cargando solicitudes…" />
            ) : requestsFailed ? (
              <ErrorState
                message="No se pudieron cargar las solicitudes. Revisa tu conexión y vuelve a intentarlo."
                onRetry={() => loadAll(statusFilter)}
              />
            ) : requests.length === 0 ? (
              <p className="border-atlas-line text-atlas-mist mt-4 rounded-xs border border-dashed px-5 py-8 text-sm">
                {tab.empty}
              </p>
            ) : (
              <ul>
                {requests.map((req) => (
                  <RequestRow
                    key={req.uid}
                    req={req}
                    eventName={eventName(req.eventSlug)}
                    decision={decision?.uid === req.uid ? decision.mode : null}
                    assignable={assignable}
                    busy={busy === req.uid}
                    onOpen={(mode) => setDecision({ uid: req.uid, mode })}
                    onCancel={() => setDecision(null)}
                    onConfirm={(approve, role, note) =>
                      decide(req, approve, role, note)
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="acceso-invitaciones" className="@container">
            <SectionHeading
              action={
                !loading &&
                !invitationsFailed &&
                invitations.length > 0 && (
                  <span className="text-atlas-fog text-sm tabular-nums">
                    {openInvitations}{" "}
                    {openInvitations === 1 ? "pendiente" : "pendientes"}
                  </span>
                )
              }
            >
              <span id="acceso-invitaciones">Invitaciones</span>
            </SectionHeading>

            {loading ? (
              <LoadingState label="Cargando invitaciones…" />
            ) : invitationsFailed ? (
              <ErrorState
                message="No se pudieron cargar las invitaciones. Revisa tu conexión y vuelve a intentarlo."
                onRetry={() => loadAll(statusFilter)}
              />
            ) : invitations.length === 0 ? (
              <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
                Todavía no se ha enviado ninguna invitación. Invita a alguien
                con el formulario «Invitar por correo».
              </p>
            ) : (
              <ul>
                {invitations.map((inv) => {
                  const state = invitationState(inv);
                  const sent = toMillis(inv.createdAt);
                  return (
                    <li
                      key={inv.id}
                      className="border-atlas-line flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b py-4 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="text-atlas-dust text-[0.9375rem] break-all">
                          {inv.emailLower}
                        </p>
                        <p className="text-atlas-mist mt-0.5 text-sm">
                          {roleLabel(inv.role)}
                          <span className="text-atlas-fog">
                            {sent !== null && ` · enviada ${formatWhen(sent)}`}
                            {` · ${state.detail}`}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`atlas-label ${state.tone}`}>
                          {state.label}
                        </span>
                        {state.open && (
                          <button
                            type="button"
                            onClick={() => revoke(inv)}
                            disabled={busy === inv.id}
                            className={destructiveQuietClass}
                          >
                            {busy === inv.id ? "Revocando…" : "Revocar"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside
          aria-labelledby="acceso-invitar"
          className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
        >
          <CornerNodes />
          <h2 id="acceso-invitar" className="atlas-label text-atlas-glow">
            Invitar por correo
          </h2>
          <p className="text-atlas-mist mt-3 text-sm leading-relaxed">
            El enlace solo funciona con ese correo, así que reenviarlo a otra
            persona no le sirve. Caduca a los 14 días, y una invitación nueva al
            mismo correo reemplaza a la anterior.
          </p>
          <form onSubmit={sendInvitation} className="mt-5 space-y-5">
            <FormField label="Correo" required>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="persona@ejemplo.com"
                autoComplete="off"
                className={inputClass}
              />
            </FormField>
            <RoleChoice
              legend="Rol que recibirá"
              name="rol-invitacion"
              roles={assignable}
              value={inviteRole}
              onChange={setInviteRole}
              disabled={inviting}
            />
            <button
              type="submit"
              disabled={inviting || inviteEmail.trim().length === 0}
              className={`${buttonClass.secondary} w-full`}
            >
              {inviting ? "Enviando…" : `Invitar como ${roleLabel(inviteRole)}`}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

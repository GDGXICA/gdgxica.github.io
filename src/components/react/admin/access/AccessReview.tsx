import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

/** Roles que se pueden pedir o invitar. `admin` se otorga siempre a mano. */
const ASSIGNABLE: Role[] = ["contributor", "volunteer", "organizer"];

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
}

interface Invitation {
  id: string;
  emailLower: string;
  role: string;
  expiresAt?: string;
  usedAt?: { _seconds: number } | null;
  revokedAt?: { _seconds: number } | null;
  createdAt?: { _seconds: number };
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "object" && "_seconds" in (value as object)) {
    return new Date(
      (value as { _seconds: number })._seconds * 1000
    ).toLocaleDateString("es-PE");
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("es-PE");
}

/** Estado de una invitación: caducada y usada se ven distinto. */
function invitationState(inv: Invitation): {
  label: string;
  className: string;
} {
  if (inv.usedAt)
    return {
      label: "Aceptada",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    };
  if (inv.revokedAt)
    return {
      label: "Revocada",
      className:
        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    };
  if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now())
    return {
      label: "Caducada",
      className:
        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    };
  return {
    label: "Pendiente",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  };
}

export function AccessReview() {
  const { permissions } = useAuth();

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("contributor");
  const [inviting, setInviting] = useState(false);

  // Rol elegido por solicitud: puede diferir del pedido, porque se aprueba
  // lo que hace falta y no necesariamente lo que se pidió.
  const [chosenRole, setChosenRole] = useState<Record<string, string>>({});

  // Solo se ofrecen los roles que quien revisa puede otorgar; la API vuelve
  // a comprobarlo, esto es para no enseñar opciones que darían 403.
  const assignable = ASSIGNABLE.filter((role) =>
    role === "organizer" ? permissions.has("events:write") : true
  );

  useEffect(() => {
    loadAll(statusFilter);
  }, [statusFilter]);

  async function loadAll(status: string) {
    setLoading(true);
    const [reqRes, invRes] = await Promise.all([
      api.listAccessRequests(status),
      api.listInvitations(),
    ]);
    if (reqRes.success && reqRes.data) {
      setRequests(reqRes.data as AccessRequest[]);
    }
    if (invRes.success && invRes.data) {
      setInvitations(invRes.data as Invitation[]);
    }
    setLoading(false);
  }

  async function decide(req: AccessRequest, approve: boolean, role: string) {
    const note = prompt(
      approve
        ? `Aprobar a ${req.displayName || req.email} como "${
            ROLE_LABELS[role as Role] ?? role
          }".\n\nNota (se le enviará por correo y queda en la auditoría):`
        : `Rechazar la solicitud de ${req.displayName || req.email}.\n\nMotivo (se le enviará por correo):`
    );
    if (note === null || note.trim().length === 0) return;

    setBusy(req.uid);
    const res = await api.decideAccessRequest(
      req.uid,
      approve,
      note.trim(),
      role
    );
    if (res.success) {
      setRequests((prev) => prev.filter((r) => r.uid !== req.uid));
      setToast({
        message: approve ? "Solicitud aprobada" : "Solicitud rechazada",
        type: "success",
      });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  async function sendInvitation(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const res = await api.createInvitation(inviteEmail.trim(), inviteRole);
    if (res.success) {
      setInviteEmail("");
      setToast({ message: "Invitación enviada", type: "success" });
      loadAll(statusFilter);
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setInviting(false);
  }

  async function revoke(inv: Invitation) {
    if (!confirm(`Revocar la invitación de ${inv.emailLower}?`)) return;
    setBusy(inv.id);
    const res = await api.revokeInvitation(inv.id);
    if (res.success) {
      setToast({ message: "Invitación revocada", type: "success" });
      loadAll(statusFilter);
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const inputClass =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div className="space-y-10">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Cola de solicitudes */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Solicitudes de acceso
          </h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputClass}
          >
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
          </select>
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay solicitudes {statusFilter === "pending" ? "pendientes" : ""}.
          </p>
        ) : (
          <ul className="space-y-3">
            {requests.map((req) => (
              <li
                key={req.uid}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {req.displayName || "(sin nombre)"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {req.email} · pide{" "}
                      <strong>
                        {ROLE_LABELS[req.requestedRole as Role] ??
                          req.requestedRole}
                      </strong>
                      {req.eventSlug && ` · evento ${req.eventSlug}`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(req.createdAt)}
                  </span>
                </div>

                <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                  {req.motivo}
                </p>
                {req.links && (
                  <p className="mt-1 text-xs break-all text-gray-500 dark:text-gray-400">
                    {req.links}
                  </p>
                )}

                {req.status === "pending" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <select
                      value={chosenRole[req.uid] ?? req.requestedRole}
                      onChange={(e) =>
                        setChosenRole((prev) => ({
                          ...prev,
                          [req.uid]: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={busy === req.uid}
                      onClick={() =>
                        decide(
                          req,
                          true,
                          chosenRole[req.uid] ?? req.requestedRole
                        )
                      }
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      disabled={busy === req.uid}
                      onClick={() => decide(req, false, req.requestedRole)}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Invitaciones */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          Invitaciones
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          El enlace se envía por correo y solo funciona con esa dirección, así
          que reenviarlo a otra persona no le sirve de nada. Caduca a los 14
          días.
        </p>

        <form onSubmit={sendInvitation} className="mb-6 flex flex-wrap gap-2">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="persona@ejemplo.com"
            className={`${inputClass} min-w-56 flex-1`}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className={inputClass}
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {inviting ? "Enviando..." : "Invitar"}
          </button>
        </form>

        {invitations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Todavía no se ha enviado ninguna invitación.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {["Correo", "Rol", "Estado", "Caduca", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {invitations.map((inv) => {
                  const state = invitationState(inv);
                  const open = state.label === "Pendiente";
                  return (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {inv.emailLower}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {ROLE_LABELS[inv.role as Role] ?? inv.role}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${state.className}`}
                        >
                          {state.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {formatDate(inv.expiresAt)}
                      </td>
                      <td className="px-4 py-3">
                        {open && (
                          <button
                            onClick={() => revoke(inv)}
                            disabled={busy === inv.id}
                            className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            Revocar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

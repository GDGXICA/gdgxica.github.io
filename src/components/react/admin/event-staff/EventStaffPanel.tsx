import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";
import {
  ROLE_BUNDLES,
  ROLE_LABELS,
  isRole,
  type Role,
} from "@/lib/permissions";

/** Roles cuyos permisos dependen de estar asignado a un evento. */
const SCOPED_ROLES = (Object.keys(ROLE_BUNDLES) as Role[]).filter(
  (role) => ROLE_BUNDLES[role].perEvent.length > 0
);

interface StaffEntry {
  uid: string;
  role?: string;
  assignedBy?: string;
  expiresAt?: string | { _seconds: number } | null;
  reason?: string;
  active: boolean;
}

interface Candidate {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status?: string;
}

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("slug");
}

function formatDate(value: StaffEntry["expiresAt"]): string {
  if (!value) return "Sin caducidad";
  const ms =
    typeof value === "object" && "_seconds" in value
      ? value._seconds * 1000
      : new Date(value as string).getTime();
  return Number.isNaN(ms) ? "—" : new Date(ms).toLocaleDateString("es-PE");
}

export function EventStaffPanel() {
  const { can } = useAuth();
  const canAssign = can("users:role:write");

  const [slug] = useState<string | null>(slugFromUrl());
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [pickedUid, setPickedUid] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [staffRes, usersRes] = await Promise.all([
      api.listEventStaff(slug),
      canAssign ? api.listUsers() : Promise.resolve({ success: false }),
    ]);
    if (staffRes.success && staffRes.data) {
      setStaff(staffRes.data as StaffEntry[]);
    }
    if (usersRes.success && "data" in usersRes && usersRes.data) {
      // Solo se ofrecen los roles que ganan algo con la asignación: para el
      // resto, el documento no concedería nada y confundiría.
      setCandidates(
        (usersRes.data as Candidate[]).filter(
          (u) =>
            isRole(u.role) &&
            SCOPED_ROLES.includes(u.role) &&
            u.status !== "suspended"
        )
      );
    }
    setLoading(false);
  }, [slug, canAssign]);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || !pickedUid) return;
    setBusy(pickedUid);
    const res = await api.assignEventStaff(slug, pickedUid, {
      reason: reason.trim(),
      expiresAt: expiresAt
        ? new Date(`${expiresAt}T23:59:59`).toISOString()
        : null,
    });
    if (res.success) {
      setToast({ message: "Persona asignada al evento", type: "success" });
      setPickedUid("");
      setReason("");
      setExpiresAt("");
      load();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  async function remove(entry: StaffEntry) {
    if (!slug) return;
    if (!confirm("¿Quitar a esta persona del equipo del evento?")) return;
    setBusy(entry.uid);
    const res = await api.removeEventStaff(slug, entry.uid);
    if (res.success) {
      setStaff((prev) => prev.filter((s) => s.uid !== entry.uid));
      setToast({ message: "Asignación retirada", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  if (!slug) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Falta el evento. Entra desde la lista de eventos o añade{" "}
        <code>?slug=mi-evento</code> a la URL.
      </div>
    );
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

  const named = (uid: string) =>
    candidates.find((c) => c.uid === uid)?.displayName ?? uid;

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Equipo de <strong>{slug}</strong>. Quien esté aquí puede operar el
        check-in y los minijuegos <em>de este evento y solo de este</em>. Al
        caducar la asignación, el acceso se apaga solo.
      </p>

      {canAssign && (
        <form
          onSubmit={assign}
          className="mb-8 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
        >
          <h2 className="mb-3 font-medium text-gray-900 dark:text-white">
            Asignar a alguien
          </h2>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay nadie con un rol acotable a eventos ({" "}
              {SCOPED_ROLES.map((r) => ROLE_LABELS[r]).join(", ")} ). Cambia
              primero su rol en Usuarios.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Persona
                </span>
                <select
                  required
                  value={pickedUid}
                  onChange={(e) => setPickedUid(e.target.value)}
                  className={`${inputClass} mt-1 w-full`}
                >
                  <option value="">Elige…</option>
                  {candidates.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.displayName || c.email} ·{" "}
                      {ROLE_LABELS[c.role as Role] ?? c.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Caduca (opcional)
                </span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="flex-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Motivo
                </span>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Apoyo en puerta"
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <button
                type="submit"
                disabled={busy !== null || !pickedUid || !reason.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Asignar
              </button>
            </div>
          )}
        </form>
      )}

      {staff.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Todavía no hay nadie asignado a este evento.
        </p>
      ) : (
        <ul className="space-y-2">
          {staff.map((entry) => (
            <li
              key={entry.uid}
              className={`flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 ${
                entry.active ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  {named(entry.uid)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {ROLE_LABELS[entry.role as Role] ?? entry.role} ·{" "}
                  {formatDate(entry.expiresAt)}
                  {entry.reason && ` · ${entry.reason}`}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  entry.active
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                }`}
              >
                {entry.active ? "Activa" : "Caducada"}
              </span>
              {canAssign && (
                <button
                  onClick={() => remove(entry)}
                  disabled={busy === entry.uid}
                  className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

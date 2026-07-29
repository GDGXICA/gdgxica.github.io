import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";
import {
  ROLES,
  ROLE_LABELS,
  effectivePermissions,
  isRole,
  type PermissionGrant,
  type Role,
} from "@/lib/permissions";
import { GrantEditor } from "./GrantEditor";

export interface UserEntry {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: string;
  status?: string;
  grants?: PermissionGrant[];
  revocations?: string[];
  lastLoginAt?: { _seconds: number };
}

type RoleFilter = "all" | Role;
type StatusFilter = "all" | "active" | "suspended";

function formatDate(timestamp: { _seconds: number } | undefined) {
  if (!timestamp?._seconds) return "-";
  return new Date(timestamp._seconds * 1000).toLocaleDateString("es-PE");
}

/**
 * Pide el motivo que la API exige. Devuelve `null` si se cancela o se deja
 * vacío, y en ese caso no se envía nada — el motivo no es decorativo, es lo
 * que hace útil la auditoría cuando se revisa meses después.
 */
function askReason(action: string): string | null {
  const reason = prompt(
    `${action}\n\nMotivo (queda registrado en la auditoría):`
  );
  if (reason === null) return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function UserDirectory() {
  const { can, user: currentUser } = useAuth();
  const canManage = can("users:role:write");

  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingGrants, setEditingGrants] = useState<UserEntry | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const res = await api.listUsers();
    if (res.success && res.data) {
      setUsers(res.data as UserEntry[]);
    } else {
      setError(res.error || "Error al cargar usuarios");
    }
    setLoading(false);
  }

  async function handleRoleChange(target: UserEntry, newRole: string) {
    const reason = askReason(
      `Cambiar el rol de ${target.displayName || target.email} a "${
        ROLE_LABELS[newRole as Role] ?? newRole
      }".`
    );
    if (!reason) return;

    setBusy(target.uid);
    const res = await api.updateUserRole(target.uid, newRole, reason);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u.uid === target.uid ? { ...u, role: newRole } : u))
      );
      setToast({ message: "Rol actualizado", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  async function handleStatusToggle(target: UserEntry) {
    const suspending = (target.status ?? "active") !== "suspended";
    const reason = askReason(
      suspending
        ? `Suspender a ${target.displayName || target.email}. Pierde TODOS sus permisos de inmediato.`
        : `Reactivar a ${target.displayName || target.email}.`
    );
    if (!reason) return;

    const nextStatus = suspending ? "suspended" : "active";
    setBusy(target.uid);
    const res = await api.updateUserStatus(target.uid, nextStatus, reason);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === target.uid ? { ...u, status: nextStatus } : u
        )
      );
      setToast({
        message: suspending ? "Cuenta suspendida" : "Cuenta reactivada",
        type: "success",
      });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  async function handleGrantsSave(
    target: UserEntry,
    grants: PermissionGrant[],
    revocations: string[],
    reason: string
  ) {
    setBusy(target.uid);
    const res = await api.updateUserGrants(
      target.uid,
      grants,
      revocations,
      reason
    );
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === target.uid ? { ...u, grants, revocations } : u
        )
      );
      setToast({ message: "Permisos actualizados", type: "success" });
      setEditingGrants(null);
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      const status = u.status ?? "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!needle) return true;
      return (
        u.displayName?.toLowerCase().includes(needle) ||
        u.email?.toLowerCase().includes(needle) ||
        u.uid.toLowerCase().includes(needle)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  const selectClass =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {editingGrants && (
        <GrantEditor
          user={editingGrants}
          saving={busy === editingGrants.uid}
          onCancel={() => setEditingGrants(null)}
          onSave={(grants, revocations, reason) =>
            handleGrantsSave(editingGrants, grants, revocations, reason)
          }
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, email o uid"
          className="min-w-56 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className={selectClass}
        >
          <option value="all">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={selectClass}
        >
          <option value="all">Activos y suspendidos</option>
          <option value="active">Solo activos</option>
          <option value="suspended">Solo suspendidos</option>
        </select>
      </div>

      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {visible.length} de {users.length} usuarios
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {[
                "Usuario",
                "Rol",
                "Estado",
                "Permisos",
                "Último acceso",
                "",
              ].map((h) => (
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
            {visible.map((u) => {
              const status = u.status ?? "active";
              const suspended = status === "suspended";
              const isSelf = u.uid === currentUser?.uid;
              const perms = effectivePermissions({
                role: u.role,
                status,
                grants: u.grants,
                revocations: u.revocations,
              });
              const extraGrants = (u.grants ?? []).length;
              const revoked = (u.revocations ?? []).length;

              return (
                <tr
                  key={u.uid}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    suspended ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.photoURL && (
                        <img
                          src={u.photoURL}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {u.displayName || "(sin nombre)"}
                          {isSelf && (
                            <span className="ml-2 text-xs text-gray-400">
                              (tú)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {canManage && !isSelf ? (
                      <select
                        value={isRole(u.role) ? u.role : "member"}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        disabled={busy === u.uid}
                        className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {ROLE_LABELS[u.role as Role] ?? u.role}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        suspended
                          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      }`}
                    >
                      {suspended ? "Suspendido" : "Activo"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                    <p>{perms.size} efectivos</p>
                    {extraGrants > 0 && (
                      <p className="text-amber-700 dark:text-amber-400">
                        +{extraGrants} concedido{extraGrants !== 1 && "s"}
                      </p>
                    )}
                    {revoked > 0 && (
                      <p className="text-red-700 dark:text-red-400">
                        −{revoked} revocado{revoked !== 1 && "s"}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(u.lastLoginAt)}
                  </td>

                  <td className="px-4 py-3">
                    {canManage && !isSelf && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingGrants(u)}
                          disabled={busy === u.uid}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          Permisos
                        </button>
                        <button
                          onClick={() => handleStatusToggle(u)}
                          disabled={busy === u.uid}
                          className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                            suspended
                              ? "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                              : "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                          }`}
                        >
                          {suspended ? "Reactivar" : "Suspender"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Ningún usuario coincide con el filtro.
        </p>
      )}
    </div>
  );
}

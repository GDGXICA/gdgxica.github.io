import { useMemo, useState } from "react";
import {
  GLOBAL_SCOPE,
  PERMISSIONS,
  ROLE_BUNDLES,
  ROLE_LABELS,
  effectivePermissions,
  isRole,
  type Permission,
  type PermissionGrant,
  type Role,
} from "@/lib/permissions";
import { useAuth } from "../AuthProvider";
import type { UserEntry } from "./UserDirectory";

interface Props {
  user: UserEntry;
  saving: boolean;
  onCancel: () => void;
  onSave: (
    grants: PermissionGrant[],
    revocations: string[],
    reason: string
  ) => void;
}

/** Convierte la caducidad guardada a `yyyy-mm-dd` para el input date. */
function toDateInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function GrantEditor({ user, saving, onCancel, onSave }: Props) {
  const { permissions: actorPermissions } = useAuth();

  const role: Role = isRole(user.role) ? user.role : "member";
  const bundle = ROLE_BUNDLES[role];

  const [grants, setGrants] = useState<PermissionGrant[]>(() =>
    (user.grants ?? []).map((g) => ({ ...g }))
  );
  const [revocations, setRevocations] = useState<string[]>(() => [
    ...(user.revocations ?? []),
  ]);
  const [reason, setReason] = useState("");

  // La API rechaza conceder lo que el actor no tiene; se filtra aquí también
  // para no ofrecer opciones que van a devolver 403.
  const grantable = useMemo(
    () => PERMISSIONS.filter((p) => actorPermissions.has(p)),
    [actorPermissions]
  );

  const fromRole = useMemo(
    () => new Set<Permission>([...bundle.global, ...bundle.perEvent]),
    [bundle]
  );

  const effective = useMemo(
    () =>
      effectivePermissions({
        role: user.role,
        status: user.status,
        grants,
        revocations,
      }),
    [user.role, user.status, grants, revocations]
  );

  function addGrant() {
    const first = grantable.find(
      (p) => !grants.some((g) => g.permission === p)
    );
    if (!first) return;
    setGrants((prev) => [
      ...prev,
      { permission: first, scope: GLOBAL_SCOPE, expiresAt: null },
    ]);
  }

  function updateGrant(index: number, patch: Partial<PermissionGrant>) {
    setGrants((prev) =>
      prev.map((g, i) => (i === index ? { ...g, ...patch } : g))
    );
  }

  function removeGrant(index: number) {
    setGrants((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleRevocation(permission: Permission) {
    setRevocations((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  }

  const inputClass =
    "rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Permisos de {user.displayName || user.email}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Rol {ROLE_LABELS[role]} · {effective.size} permisos efectivos
        </p>

        {/* Concesiones */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-white">
              Permisos concedidos
            </h3>
            <button
              type="button"
              onClick={addGrant}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              + Añadir
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Se suman a los del rol. Solo puedes conceder permisos que tú tengas.
            Deja el alcance en <code>*</code> para toda la plataforma, o pon el
            slug de un evento para acotarlo.
          </p>

          {grants.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
              Sin permisos adicionales.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {grants.map((grant, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
                >
                  <select
                    value={grant.permission}
                    onChange={(e) =>
                      updateGrant(index, {
                        permission: e.target.value as Permission,
                      })
                    }
                    className={`${inputClass} font-mono`}
                  >
                    {grantable.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={grant.scope}
                    onChange={(e) =>
                      updateGrant(index, { scope: e.target.value })
                    }
                    placeholder="*"
                    className={`${inputClass} w-40`}
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    Caduca
                    <input
                      type="date"
                      value={toDateInput(grant.expiresAt)}
                      onChange={(e) =>
                        updateGrant(index, {
                          expiresAt: e.target.value
                            ? new Date(
                                `${e.target.value}T23:59:59`
                              ).toISOString()
                            : null,
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeGrant(index)}
                    className="ml-auto rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Revocaciones */}
        <section className="mt-6">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Permisos retirados del rol
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Marca los que esta persona NO debe tener pese a que su rol los
            incluya. Una revocación gana siempre, incluso sobre un permiso
            concedido arriba.
          </p>
          {fromRole.size === 0 ? (
            <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
              El rol {ROLE_LABELS[role]} no otorga permisos que retirar.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...fromRole].map((permission) => {
                const revoked = revocations.includes(permission);
                return (
                  <button
                    key={permission}
                    type="button"
                    onClick={() => toggleRevocation(permission)}
                    className={`rounded-full px-3 py-1 font-mono text-xs font-medium transition-colors ${
                      revoked
                        ? "bg-red-100 text-red-800 line-through dark:bg-red-900/40 dark:text-red-300"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {permission}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <label className="mt-6 block">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Motivo <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Por qué se hace este cambio"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || reason.trim().length === 0}
            onClick={() => onSave(grants, revocations, reason.trim())}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

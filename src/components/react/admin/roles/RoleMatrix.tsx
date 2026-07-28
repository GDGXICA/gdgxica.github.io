import { Fragment, useMemo, useState } from "react";
import {
  PERMISSIONS,
  ROLES,
  ROLE_BUNDLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Permission,
  type Role,
} from "@/lib/permissions";

/** Cómo otorga un rol un permiso concreto. */
type Level = "global" | "perEvent" | "none";

function levelFor(role: Role, permission: Permission): Level {
  const bundle = ROLE_BUNDLES[role];
  if (bundle.global.includes(permission)) return "global";
  if (bundle.perEvent.includes(permission)) return "perEvent";
  return "none";
}

/** Agrupa por el prefijo del permiso (`events:read` → `events`). */
function groupOf(permission: Permission): string {
  return permission.split(":")[0];
}

const GROUP_LABELS: Record<string, string> = {
  events: "Eventos",
  speakers: "Speakers",
  sponsors: "Sponsors",
  team: "Equipo",
  stats: "Estadísticas",
  locations: "Ubicaciones",
  forms: "Formularios",
  roster: "Asistentes",
  checkin: "Check-in",
  certificates: "Certificados",
  minigames: "Minijuegos",
  proposals: "Propuestas",
  users: "Usuarios",
  access: "Accesos",
  audit: "Auditoría",
  rebuild: "Despliegue",
};

const CELL: Record<Level, { label: string; className: string; title: string }> =
  {
    global: {
      label: "Sí",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      title: "Concedido en toda la plataforma",
    },
    perEvent: {
      label: "Por evento",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      title:
        "Solo en los eventos donde la persona esté asignada, y mientras dure la asignación",
    },
    none: {
      label: "—",
      className: "text-gray-300 dark:text-gray-600",
      title: "No concedido",
    },
  };

export function RoleMatrix() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = PERMISSIONS.filter(
      (p) => !needle || p.toLowerCase().includes(needle)
    );
    const byGroup = new Map<string, Permission[]>();
    for (const permission of filtered) {
      const key = groupOf(permission);
      const list = byGroup.get(key) ?? [];
      list.push(permission);
      byGroup.set(key, list);
    }
    return [...byGroup.entries()];
  }, [query]);

  return (
    <div>
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
        <p className="font-medium">Esta matriz es de solo lectura.</p>
        <p className="mt-1">
          Los roles y sus permisos viven en el código, no en la base de datos:
          así nadie puede redefinir qué significa un rol desde el panel. Para
          dar o quitar permisos a una persona concreta, usa los permisos
          puntuales en{" "}
          <a href="/admin/users" className="underline">
            Usuarios
          </a>
          .
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((role) => (
          <div
            key={role}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <p className="font-semibold text-gray-900 dark:text-white">
              {ROLE_LABELS[role]}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      <label className="mb-4 block">
        <span className="sr-only">Filtrar permisos</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar permisos (p. ej. roster, events:write)"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Permiso
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  className="px-4 py-3 text-center text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
                >
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {groups.map(([group, permissions]) => (
              <Fragment key={group}>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <td
                    colSpan={ROLES.length + 1}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase dark:text-gray-300"
                  >
                    {GROUP_LABELS[group] ?? group}
                  </td>
                </tr>
                {permissions.map((permission) => (
                  <tr
                    key={permission}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {permission}
                    </td>
                    {ROLES.map((role) => {
                      const cell = CELL[levelFor(role, permission)];
                      return (
                        <td key={role} className="px-4 py-2 text-center">
                          <span
                            title={cell.title}
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cell.className}`}
                          >
                            {cell.label}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {groups.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Ningún permiso coincide con «{query}».
        </p>
      )}
    </div>
  );
}

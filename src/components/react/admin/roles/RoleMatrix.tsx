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
import { GROUP_LABELS, PERMISSION_LABELS } from "./labels";

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

const LEVEL_TITLE: Record<Level, string> = {
  global: "Concedido en toda la plataforma",
  perEvent:
    "Solo en los eventos donde la persona esté asignada, y mientras dure la asignación",
  none: "No concedido",
};

function Mark({ level }: { level: Level }) {
  if (level === "global") {
    return (
      <span
        title={LEVEL_TITLE.global}
        className="bg-atlas-dust inline-block size-3 rounded-full"
      >
        <span className="sr-only">Sí</span>
      </span>
    );
  }
  if (level === "perEvent") {
    return (
      <span
        title={LEVEL_TITLE.perEvent}
        className="border-atlas-glow inline-block size-3 rounded-full border-2"
      >
        <span className="sr-only">Por evento</span>
      </span>
    );
  }
  return (
    <span
      title={LEVEL_TITLE.none}
      className="bg-atlas-line inline-block h-px w-3"
    >
      <span className="sr-only">No</span>
    </span>
  );
}

export function RoleMatrix() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = PERMISSIONS.filter(
      (p) =>
        !needle ||
        p.toLowerCase().includes(needle) ||
        PERMISSION_LABELS[p].toLowerCase().includes(needle)
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

  const counts = useMemo(
    () =>
      Object.fromEntries(
        ROLES.map((role) => [
          role,
          new Set([
            ...ROLE_BUNDLES[role].global,
            ...ROLE_BUNDLES[role].perEvent,
          ]).size,
        ])
      ) as Record<Role, number>,
    []
  );

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-atlas-mist mb-6 max-w-[70ch] text-sm leading-relaxed">
        <span className="atlas-label text-atlas-glow mr-2">Solo lectura</span>
        Los roles y sus permisos viven en el código, no en la base de datos: así
        nadie puede redefinir qué significa un rol desde el panel. Para dar o
        quitar permisos a una persona concreta, usa los permisos puntuales en{" "}
        <a
          href="/admin/users"
          className="text-atlas-dust font-semibold underline underline-offset-4"
        >
          Usuarios
        </a>
        .
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <label className="w-full max-w-sm">
          <span className="sr-only">Filtrar permisos</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar permisos (p. ej. asistencia, events:write)"
            className="border-atlas-line bg-atlas-night text-atlas-dust w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <p className="text-atlas-mist flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <Mark level="global" /> En toda la plataforma
          </span>
          <span className="flex items-center gap-1.5">
            <Mark level="perEvent" /> Solo en sus eventos asignados
          </span>
        </p>
      </div>

      <div className="border-atlas-line relative max-h-[calc(100vh-15rem)] overflow-auto rounded-xs border">
        <table className="min-w-[48rem] border-collapse text-sm sm:min-w-[56rem]">
          <thead>
            <tr>
              <th className="bg-atlas-night border-atlas-line sticky top-0 left-0 z-20 w-40 border-b px-4 py-3 text-left align-bottom sm:w-72">
                <span className="atlas-label text-atlas-fog">Permiso</span>
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="bg-atlas-night border-atlas-line sticky top-0 z-10 w-40 border-b border-l px-3 py-3 text-left align-top font-normal"
                >
                  <span className="atlas-name text-atlas-dust block text-base leading-tight">
                    {ROLE_LABELS[role]}
                  </span>
                  <span className="text-atlas-glow mt-1 block text-xs tabular-nums">
                    {counts[role]} {counts[role] === 1 ? "permiso" : "permisos"}
                  </span>
                  <span className="text-atlas-fog mt-1.5 block text-xs leading-snug">
                    {ROLE_DESCRIPTIONS[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, permissions]) => (
              <Fragment key={group}>
                <tr>
                  <th
                    colSpan={ROLES.length + 1}
                    scope="colgroup"
                    className="bg-atlas-deep/60 border-atlas-line border-b px-4 py-2 text-left"
                  >
                    <span className="atlas-label text-atlas-glow sticky left-4">
                      {GROUP_LABELS[group] ?? group}
                    </span>
                  </th>
                </tr>
                {permissions.map((permission) => (
                  <tr key={permission} className="group hover:bg-atlas-deep/40">
                    <th
                      scope="row"
                      className="bg-atlas-night group-hover:bg-atlas-deep border-atlas-line sticky left-0 z-10 border-b px-4 py-2.5 text-left font-normal"
                    >
                      <span className="text-atlas-dust block">
                        {PERMISSION_LABELS[permission]}
                      </span>
                      <code className="text-atlas-fog text-xs">
                        {permission}
                      </code>
                    </th>
                    {ROLES.map((role) => (
                      <td
                        key={role}
                        className="border-atlas-line border-b border-l px-3 py-2.5 text-center"
                      >
                        <Mark level={levelFor(role, permission)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && (
          <p className="text-atlas-mist px-4 py-6 text-sm">
            Ningún permiso coincide con «{query}».
          </p>
        )}
      </div>
    </div>
  );
}

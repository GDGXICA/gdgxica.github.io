/**
 * Espejo de cliente del catálogo de permisos.
 *
 * Sirve ÚNICAMENTE para pintar la UI (ocultar lo que no se puede usar). La
 * autoridad real es `functions/src/auth/permissions.ts`, que se evalúa en el
 * servidor y en las reglas de Firestore: esconder un botón no protege nada.
 *
 * `functions/src/auth/permissions.test.ts` falla si este archivo se
 * desincroniza del canónico.
 */

export const PERMISSIONS = [
  "events:read",
  "events:write",
  "events:delete",
  "speakers:read",
  "speakers:write",
  "speakers:delete",
  "sponsors:read",
  "sponsors:write",
  "sponsors:delete",
  "team:read",
  "team:write",
  "stats:read",
  "stats:write",
  "locations:read",
  "locations:write",
  "locations:delete",
  "forms:read",
  "forms:write",
  "forms:responses:read",
  "roster:read",
  "checkin:operate",
  "checkin:import",
  "certificates:send",
  "minigames:template:read",
  "minigames:template:write",
  "minigames:operate",
  "proposals:create",
  "proposals:review",
  "users:read",
  "users:role:write",
  "access:review",
  "audit:read",
  "rebuild:trigger",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "member",
  "contributor",
  "volunteer",
  "organizer",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

export type UserStatus = "active" | "suspended";

export const GLOBAL_SCOPE = "*";

/** Etiquetas en español para la matriz de roles y los selectores del panel. */
export const ROLE_LABELS: Record<Role, string> = {
  member: "Miembro",
  contributor: "Colaborador externo",
  volunteer: "Voluntario de evento",
  organizer: "Organizador",
  admin: "Administrador",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  member:
    "Participa en eventos y minijuegos. Sin acceso al panel de administración.",
  contributor:
    "Propone eventos y speakers como borradores. Un organizador revisa y publica. No accede a datos personales.",
  volunteer:
    "Opera el check-in y los minijuegos, solo en los eventos donde está asignado y mientras dure la asignación.",
  organizer:
    "Gestiona contenido, check-in, certificados y revisa propuestas. No administra usuarios ni borra contenido.",
  admin:
    "Control total, incluida la gestión de usuarios, accesos y la auditoría.",
};

interface RoleBundle {
  global: readonly Permission[];
  perEvent: readonly Permission[];
}

const ORGANIZER_GLOBAL: readonly Permission[] = [
  "events:read",
  "events:write",
  "speakers:read",
  "speakers:write",
  "team:read",
  "stats:read",
  "locations:read",
  "locations:write",
  "forms:read",
  "forms:responses:read",
  "roster:read",
  "checkin:operate",
  "checkin:import",
  "certificates:send",
  "minigames:operate",
  "proposals:create",
  "proposals:review",
];

export const ROLE_BUNDLES: Record<Role, RoleBundle> = {
  member: { global: [], perEvent: [] },
  contributor: { global: ["proposals:create"], perEvent: [] },
  volunteer: {
    global: [],
    perEvent: ["roster:read", "checkin:operate", "minigames:operate"],
  },
  organizer: { global: ORGANIZER_GLOBAL, perEvent: [] },
  admin: { global: PERMISSIONS, perEvent: [] },
};

export interface PermissionGrant {
  permission: Permission;
  scope: string;
  expiresAt?: unknown;
  grantedBy?: string;
  grantedAt?: unknown;
  reason?: string;
}

export interface PermissionSubject {
  role?: unknown;
  status?: unknown;
  grants?: unknown;
  revocations?: unknown;
}

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

export function isPermission(value: unknown): value is Permission {
  return (
    typeof value === "string" &&
    (PERMISSIONS as readonly string[]).includes(value)
  );
}

function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const obj = value as {
      toMillis?: unknown;
      _seconds?: unknown;
      seconds?: unknown;
    };
    if (typeof obj.toMillis === "function") {
      const ms = (obj.toMillis as () => number)();
      return Number.isFinite(ms) ? ms : null;
    }
    const seconds = obj._seconds ?? obj.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  return null;
}

export function isGrantActive(grant: PermissionGrant, nowMs: number): boolean {
  if (grant.expiresAt === null || grant.expiresAt === undefined) return true;
  const expiry = toMillis(grant.expiresAt);
  if (expiry === null) return false;
  return expiry > nowMs;
}

function readGrants(raw: unknown): PermissionGrant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((g): g is PermissionGrant => {
    if (!g || typeof g !== "object") return false;
    const grant = g as PermissionGrant;
    return isPermission(grant.permission) && typeof grant.scope === "string";
  });
}

function readRevocations(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPermission);
}

export interface PermissionContext {
  scope?: string;
  isEventStaff?: boolean;
  nowMs?: number;
}

export function effectivePermissions(
  subject: PermissionSubject,
  ctx: PermissionContext = {}
): Set<Permission> {
  const scope = ctx.scope ?? GLOBAL_SCOPE;
  const nowMs = ctx.nowMs ?? Date.now();

  if (subject.status === "suspended") return new Set();

  const role = isRole(subject.role) ? subject.role : "member";
  const bundle = ROLE_BUNDLES[role];

  const granted = new Set<Permission>(bundle.global);

  if (scope !== GLOBAL_SCOPE && ctx.isEventStaff) {
    for (const perm of bundle.perEvent) granted.add(perm);
  }

  for (const grant of readGrants(subject.grants)) {
    if (!isGrantActive(grant, nowMs)) continue;
    if (grant.scope === GLOBAL_SCOPE || grant.scope === scope) {
      granted.add(grant.permission);
    }
  }

  for (const perm of readRevocations(subject.revocations)) {
    granted.delete(perm);
  }

  return granted;
}

export function hasPermission(
  subject: PermissionSubject,
  permission: Permission,
  ctx: PermissionContext = {}
): boolean {
  return effectivePermissions(subject, ctx).has(permission);
}

/**
 * `true` si la persona tiene algo que hacer dentro del panel.
 *
 * Cuenta también los permisos `perEvent` del rol, aunque a alcance global no
 * concedan nada: un voluntario necesita entrar al panel precisamente para
 * llegar a los eventos que tiene asignados. Es solo la puerta de la UI — cada
 * sección y cada endpoint vuelven a comprobar el permiso con su alcance real.
 */
export function canAccessPanel(subject: PermissionSubject): boolean {
  if (subject.status === "suspended") return false;
  if (effectivePermissions(subject).size > 0) return true;

  const role = isRole(subject.role) ? subject.role : "member";
  return ROLE_BUNDLES[role].perEvent.length > 0;
}

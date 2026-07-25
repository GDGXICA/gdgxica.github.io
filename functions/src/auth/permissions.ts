/**
 * Catálogo de permisos y bundles de rol.
 *
 * Esta es la ÚNICA autoridad sobre qué puede hacer cada quien. Vive en
 * código a propósito: una sesión de admin comprometida puede cambiar el rol
 * de un usuario, pero no puede redefinir qué significa un rol para todos.
 *
 * `src/lib/permissions.ts` es un espejo para pintar la UI. El test de este
 * módulo falla si los dos se desincronizan.
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

/** Alcance de un permiso: `*` es global, cualquier otro valor es un slug de evento. */
export const GLOBAL_SCOPE = "*";

/**
 * Permisos que otorga un rol.
 *
 * - `global`: valen en toda la plataforma.
 * - `perEvent`: valen SOLO en los eventos donde la persona esté asignada
 *   como staff (`events/{slug}/staff/{uid}`). Un rol con permisos perEvent
 *   no concede absolutamente nada mientras no tenga asignaciones, que es
 *   justo lo que queremos para gente externa o temporal.
 */
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
  // Operar los minijuegos de un evento es parte de llevar el evento. Las
  // PLANTILLAS siguen siendo de admin: son configuración global, no
  // operación.
  "minigames:operate",
  // Un organizador ya puede escribir eventos directamente, así que poder
  // proponerlos no le añade alcance. Está aquí para que `organizer` contenga
  // a `contributor` y a `volunteer`: si no, la regla de no escalada le
  // impediría dar de alta precisamente a esos dos perfiles, que es lo que
  // más va a hacer.
  "proposals:create",
  "proposals:review",
];

export const ROLE_BUNDLES: Record<Role, RoleBundle> = {
  // Cualquiera que inicie sesión. Participa en eventos y minijuegos; cero
  // acceso al panel. Es el default y no debe crecer: si alguien necesita
  // más, pasa por una solicitud o una invitación.
  member: { global: [], perEvent: [] },

  // El rol de gente de fuera de la organización: propone contenido que un
  // organizador debe revisar y publicar. Nunca toca PII ni publica directo.
  contributor: { global: ["proposals:create"], perEvent: [] },

  // Opera un evento concreto, y solo mientras esté asignado a él.
  volunteer: {
    global: [],
    perEvent: ["roster:read", "checkin:operate", "minigames:operate"],
  },

  organizer: { global: ORGANIZER_GLOBAL, perEvent: [] },

  admin: { global: PERMISSIONS, perEvent: [] },
};

export interface PermissionGrant {
  permission: Permission;
  /** `*` o el slug de un evento. */
  scope: string;
  /** `null`/ausente = sin caducidad. */
  expiresAt?: unknown;
  grantedBy?: string;
  grantedAt?: unknown;
  reason?: string;
}

/** Forma mínima del doc `users/{uid}` que necesita el evaluador. */
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

/**
 * Normaliza a milisegundos las varias formas en que puede llegar una fecha:
 * Timestamp de Firestore (admin o cliente), Date, número o ISO string.
 * Devuelve `null` cuando no se puede interpretar, y quien llama trata ese
 * caso como "caducado" — ante una fecha ilegible negamos, no concedemos.
 */
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

/**
 * Regla de caducidad compartida por grants, invitaciones y asignaciones de
 * staff: sin fecha no caduca; con fecha ilegible se considera caducado.
 * Ante una fecha que no entendemos negamos el acceso, nunca lo concedemos.
 */
export function isNotExpired(expiresAt: unknown, nowMs: number): boolean {
  if (expiresAt === null || expiresAt === undefined) return true;
  const expiry = toMillis(expiresAt);
  if (expiry === null) return false;
  return expiry > nowMs;
}

/** Un grant sin `expiresAt` no caduca; con fecha ilegible se considera caducado. */
export function isGrantActive(grant: PermissionGrant, nowMs: number): boolean {
  return isNotExpired(grant.expiresAt, nowMs);
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
  /**
   * Evento sobre el que se evalúa, o `*` para una acción global.
   */
  scope?: string;
  /**
   * `true` si la persona figura en `events/{scope}/staff/{uid}` con una
   * asignación vigente. Quien llama lo resuelve (un `exists()`), y solo
   * cuando hace falta: los permisos globales se responden sin esa lectura.
   */
  isEventStaff?: boolean;
  nowMs?: number;
}

/**
 * Permisos efectivos = bundle(rol) ∪ grants vigentes − revocations,
 * evaluados para un alcance concreto. Un usuario suspendido no tiene ninguno.
 */
export function effectivePermissions(
  subject: PermissionSubject,
  ctx: PermissionContext = {}
): Set<Permission> {
  const scope = ctx.scope ?? GLOBAL_SCOPE;
  const nowMs = ctx.nowMs ?? Date.now();

  // La suspensión gana sobre todo lo demás, incluidos los grants directos.
  if (subject.status === "suspended") return new Set();

  const role = isRole(subject.role) ? subject.role : "member";
  const bundle = ROLE_BUNDLES[role];

  const granted = new Set<Permission>(bundle.global);

  // Los permisos perEvent solo aplican dentro de un evento concreto y con
  // la asignación de staff confirmada. Nunca satisfacen una consulta global.
  if (scope !== GLOBAL_SCOPE && ctx.isEventStaff) {
    for (const perm of bundle.perEvent) granted.add(perm);
  }

  for (const grant of readGrants(subject.grants)) {
    if (!isGrantActive(grant, nowMs)) continue;
    // Un grant global sirve para cualquier alcance; uno acotado solo para
    // el evento que nombra.
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
 * `true` si el rol puede alcanzar el permiso estando asignado a un evento.
 * Lo usa el middleware para decidir si vale la pena pagar la lectura de
 * staff, en vez de hacerla siempre.
 */
export function roleCanScopePermission(
  subject: PermissionSubject,
  permission: Permission
): boolean {
  const role = isRole(subject.role) ? subject.role : "member";
  return ROLE_BUNDLES[role].perEvent.includes(permission);
}

/**
 * Permisos que alguien puede otorgar a otra persona: exactamente los que ya
 * tiene. Es la regla de no-escalada — sin ella, quien administre usuarios
 * podría concederse cualquier cosa por interpósita cuenta.
 */
export function canGrant(
  actor: PermissionSubject,
  permission: Permission
): boolean {
  return effectivePermissions(actor).has(permission);
}

/**
 * `true` si el actor puede asignar el rol indicado, es decir, si posee todos
 * los permisos que ese rol otorga (globales y por evento).
 */
export function canAssignRole(actor: PermissionSubject, role: Role): boolean {
  const actorPerms = effectivePermissions(actor);
  const bundle = ROLE_BUNDLES[role];
  return [...bundle.global, ...bundle.perEvent].every((p) => actorPerms.has(p));
}

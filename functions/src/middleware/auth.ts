import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { recordSecurityEvent } from "../utils/securityAudit";
import {
  GLOBAL_SCOPE,
  effectivePermissions,
  isNotExpired,
  isRole,
  roleCanScopePermission,
  type Permission,
  type Role,
  type UserStatus,
} from "../auth/permissions";

export interface AuthenticatedUser {
  uid: string;
  email: string;
  /**
   * Del token, no del doc de usuario. Cualquier decisión que ate una
   * identidad a una dirección de correo —canjear una invitación, sobre todo—
   * tiene que mirar esto: un correo sin verificar solo dice qué escribió
   * quien se registró.
   */
  emailVerified: boolean;
  displayName: string;
  photoURL: string;
  /** `null` cuando solo se verificó el token y no se cargó el doc de usuario. */
  role: Role | null;
  status: UserStatus;
  /** Permisos efectivos YA resueltos para el alcance de esta petición. */
  permissions: ReadonlySet<Permission>;
  /** Alcance con el que se evaluaron: `*` o el slug del evento. */
  scope: string;
  createdAt?: unknown;
  lastLoginAt?: unknown;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

interface VerifiedToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoURL: string;
}

/**
 * Verifica el Bearer token y responde 401 por su cuenta si falta o es
 * inválido. Devuelve `null` cuando ya respondió.
 *
 * No usamos `verifyIdToken(token, true)` (checkRevoked): añadiría una llamada
 * de red a Firebase Auth en cada petición, y ya leemos el doc de usuario en
 * cada una — la suspensión (`status`) y los cambios de rol surten efecto
 * inmediato por esa vía, sin ese coste.
 */
async function verifyBearer(
  req: Request,
  res: Response
): Promise<VerifiedToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "No token provided" });
    return null;
  }

  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || "",
      emailVerified: decoded.email_verified === true,
      displayName: decoded.name || "",
      photoURL: decoded.picture || "",
    };
  } catch {
    // Solo a Cloud Logging, nunca a `audit_log`: ver el nivel `log-only` en
    // utils/securityAudit.ts. Hasta ahora esto no se registraba en NINGÚN
    // sitio, así que un intento de adivinar tokens no dejaba el menor rastro.
    recordSecurityEvent({
      event: "security.auth.invalid_token",
      details: { hadHeader: true },
      req,
    });
    res.status(401).json({ success: false, error: "Invalid token" });
    return null;
  }
}

/**
 * `true` si la persona figura en `events/{slug}/staff/{uid}` con una
 * asignación vigente. Una asignación caducada no vale, sin que nadie tenga
 * que acordarse de borrarla.
 */
async function isActiveEventStaff(
  slug: string,
  uid: string,
  nowMs: number
): Promise<boolean> {
  const doc = await admin
    .firestore()
    .collection("events")
    .doc(slug)
    .collection("staff")
    .doc(uid)
    .get();

  if (!doc.exists) return false;
  return isNotExpired(doc.data()?.expiresAt, nowMs);
}

/** Mismo formato que `safeId` en schemas: un slug de evento y nada más. */
const SAFE_SCOPE = /^[a-zA-Z0-9_-]{1,100}$/;

export interface RequirePermissionOptions {
  /**
   * Nombre del parámetro de ruta que lleva el slug del evento (p. ej.
   * `"slug"`). Si se indica, el permiso se evalúa acotado a ese evento, lo
   * que permite que un voluntario asignado lo satisfaga. Sin él, el permiso
   * se exige a alcance global.
   */
  scopeParam?: string;
}

/**
 * Exige un permiso concreto. Sustituye al antiguo `requireRole`: la
 * jerarquía de roles no permitía expresar "solo el check-in de este evento".
 */
export function requirePermission(
  permission: Permission,
  options: RequirePermissionOptions = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = await verifyBearer(req, res);
    if (!token) return;

    const rawScope = options.scopeParam
      ? req.params[options.scopeParam]
      : undefined;

    // El slug acaba en una ruta de Firestore más abajo, y este middleware
    // corre ANTES que validateParamId en la cadena de la ruta. Se valida por
    // su cuenta en vez de fiarse de ese orden: un id como `.` o `..` haría
    // lanzar al SDK, y depender de que nadie reordene la cadena es una
    // garantía demasiado fina para lo que hay en juego. Va antes de leer
    // nada: una petición malformada no debe costar una lectura.
    if (
      typeof rawScope === "string" &&
      rawScope.length > 0 &&
      !SAFE_SCOPE.test(rawScope)
    ) {
      res.status(400).json({ success: false, error: "Invalid scope" });
      return;
    }

    const scope =
      typeof rawScope === "string" && rawScope.length > 0
        ? rawScope
        : GLOBAL_SCOPE;

    try {
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(token.uid)
        .get();

      if (!userDoc.exists) {
        recordSecurityEvent({
          event: "security.user.unregistered",
          uid: token.uid,
          details: { permission, scope },
          req,
        });
        res.status(403).json({ success: false, error: "User not registered" });
        return;
      }

      const data = userDoc.data() ?? {};

      if (!isRole(data.role)) {
        res.status(403).json({ success: false, error: "Invalid user data" });
        return;
      }

      if (data.status === "suspended") {
        // `critical`: una cuenta suspendida con un token todavía válido
        // intentando operar es la señal más limpia que hay de una cuenta
        // comprometida, o de alguien que ya no debería estar y sigue
        // probando. Provocarlo exige poseer una cuenta suspendida, así que no
        // hay volumen que temer y se escribe siempre.
        recordSecurityEvent({
          event: "security.account.suspended_access",
          uid: token.uid,
          details: { role: data.role, permission, scope },
          req,
        });
        res.status(403).json({ success: false, error: "Account suspended" });
        return;
      }

      const nowMs = Date.now();

      let permissions = effectivePermissions(data, { scope, nowMs });

      // La lectura de staff solo se paga cuando puede cambiar el resultado:
      // el permiso aún no está concedido, hay un evento concreto en juego, y
      // el rol lo alcanza estando asignado.
      if (
        !permissions.has(permission) &&
        scope !== GLOBAL_SCOPE &&
        roleCanScopePermission(data, permission)
      ) {
        const isStaff = await isActiveEventStaff(scope, token.uid, nowMs);
        if (isStaff) {
          permissions = effectivePermissions(data, {
            scope,
            nowMs,
            isEventStaff: true,
          });
        }
      }

      if (!permissions.has(permission)) {
        // Esta era la señal más relevante del sistema y solo existía como una
        // línea de Cloud Logging: quien revisaba el panel veía únicamente lo
        // que había salido bien, nunca a alguien tanteando qué podía tocar.
        recordSecurityEvent({
          event: "security.permission.denied",
          uid: token.uid,
          details: { role: data.role, permission, scope },
          req,
        });
        res
          .status(403)
          .json({ success: false, error: "Insufficient permissions" });
        return;
      }

      (req as AuthenticatedRequest).user = {
        uid: token.uid,
        email: token.email || (data.email as string) || "",
        emailVerified: token.emailVerified,
        displayName: token.displayName || (data.displayName as string) || "",
        photoURL: token.photoURL || (data.photoURL as string) || "",
        role: data.role,
        status: data.status === "suspended" ? "suspended" : "active",
        permissions,
        scope,
        createdAt: data.createdAt,
        lastLoginAt: data.lastLoginAt,
      };
      next();
    } catch (err) {
      logger.error("Fallo al resolver permisos", { uid: token.uid, err });
      res.status(500).json({ success: false, error: "Authorization failed" });
    }
  };
}

/**
 * Solo verifica el token: sirve para el alta inicial y para el /join de
 * minijuegos, que acepta tokens anónimos.
 *
 * `role` queda en `null` y `permissions` vacío a propósito. La versión
 * anterior rellenaba `role: "member"`, lo que hacía que cualquier handler que
 * inspeccionara `req.user.role` leyera un valor inventado en vez de la
 * verdad — una trampa esperando al siguiente que lo usara.
 */
export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = await verifyBearer(req, res);
    if (!token) return;

    (req as AuthenticatedRequest).user = {
      uid: token.uid,
      email: token.email,
      emailVerified: token.emailVerified,
      displayName: token.displayName,
      photoURL: token.photoURL,
      role: null,
      status: "active",
      permissions: new Set(),
      scope: GLOBAL_SCOPE,
    };
    next();
  };
}

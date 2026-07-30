import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { commitWithAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  GLOBAL_SCOPE,
  ROLES,
  canGrant,
  isPermission,
  isRole,
  type Permission,
  type PermissionGrant,
  type Role,
} from "../auth/permissions";
import { actorDominates, countActiveAdmins } from "../auth/guards";

const MAX_REASON = 500;
const MAX_GRANTS = 50;

/**
 * Todo cambio de acceso deja constancia de POR QUÉ se hizo. Sin esto la
 * auditoría dice quién tocó qué pero no si estaba justificado, que es lo
 * único que sirve al revisarla meses después.
 */
function readReason(body: unknown): string | null {
  const reason = (body as { reason?: unknown })?.reason;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REASON) return null;
  return trimmed;
}

export async function listUsers(_req: Request, res: Response) {
  try {
    const snapshot = await admin
      .firestore()
      .collection("users")
      .orderBy("createdAt", "desc")
      .get();

    const users = snapshot.docs.map((doc) => doc.data());
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateRole(req: Request, res: Response) {
  try {
    const uid = req.params.uid as string;
    const { role } = req.body as { role?: unknown };
    const performer = (req as AuthenticatedRequest).user;

    if (!isRole(role)) {
      res.status(400).json({
        success: false,
        error: `Invalid role. Must be: ${ROLES.join(", ")}`,
      });
      return;
    }

    const reason = readReason(req.body);
    if (!reason) {
      res.status(400).json({
        success: false,
        error: `A reason is required (1-${MAX_REASON} chars)`,
      });
      return;
    }

    if (uid === performer.uid) {
      res
        .status(400)
        .json({ success: false, error: "Cannot change your own role" });
      return;
    }

    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const previousRole = userDoc.data()?.role as Role | undefined;

    // No escalada: nadie reparte lo que no tiene, ni en el rol que asigna ni
    // en el que retira.
    if (
      !actorDominates(performer.permissions, role) ||
      !actorDominates(performer.permissions, previousRole)
    ) {
      res.status(403).json({
        success: false,
        error:
          "Cannot assign or remove a role that exceeds your own permissions",
      });
      return;
    }

    if (previousRole === "admin" && role !== "admin") {
      if ((await countActiveAdmins()) <= 1) {
        res.status(400).json({
          success: false,
          error: "Cannot demote the last active admin",
        });
        return;
      }
    }

    // El cambio de rol y su registro se confirman juntos. Antes iban en dos
    // escrituras seguidas, y como `writeAuditLog` se traga sus errores, una
    // instancia desalojada entre las dos —algo que Cloud Functions hace de
    // rutina— dejaba a alguien con permisos nuevos y sin una sola línea que lo
    // dijera.
    const batch = admin.firestore().batch();
    batch.update(userRef, { role });
    await commitWithAuditLog(
      batch,
      {
        action: "user.role.change",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "user",
        details: { newRole: role, previousRole, reason },
      },
      req
    );

    res.json({ success: true, data: { uid, role } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Suspende o reactiva una cuenta. La suspensión es la palanca de emergencia:
 * corta todos los permisos de golpe sin tener que deshacer rol y grants uno
 * a uno, y surte efecto en la siguiente petición porque el doc se lee en
 * cada una.
 */
export async function updateStatus(req: Request, res: Response) {
  try {
    const uid = req.params.uid as string;
    const { status } = req.body as { status?: unknown };
    const performer = (req as AuthenticatedRequest).user;

    if (status !== "active" && status !== "suspended") {
      res.status(400).json({
        success: false,
        error: "Invalid status. Must be: active, suspended",
      });
      return;
    }

    const reason = readReason(req.body);
    if (!reason) {
      res.status(400).json({
        success: false,
        error: `A reason is required (1-${MAX_REASON} chars)`,
      });
      return;
    }

    // Suspenderse a uno mismo solo consigue dejarte fuera; y si eres el
    // último admin, deja la plataforma sin gobierno.
    if (uid === performer.uid) {
      res
        .status(400)
        .json({ success: false, error: "Cannot change your own status" });
      return;
    }

    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const targetRole = userDoc.data()?.role;
    if (!actorDominates(performer.permissions, targetRole)) {
      res.status(403).json({
        success: false,
        error: "Cannot manage a user whose role exceeds your own permissions",
      });
      return;
    }

    if (status === "suspended" && targetRole === "admin") {
      if ((await countActiveAdmins()) <= 1) {
        res.status(400).json({
          success: false,
          error: "Cannot suspend the last active admin",
        });
        return;
      }
    }

    const batch = admin.firestore().batch();
    batch.update(userRef, { status });
    await commitWithAuditLog(
      batch,
      {
        action: "user.status.change",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "user",
        details: {
          newStatus: status,
          previousStatus: userDoc.data()?.status ?? "active",
          reason,
        },
      },
      req
    );

    res.json({ success: true, data: { uid, status } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

interface IncomingGrant {
  permission: unknown;
  scope?: unknown;
  expiresAt?: unknown;
}

/**
 * Sustituye los permisos concedidos y revocados a una persona concreta.
 *
 * Es un reemplazo completo, no un parche: así la UI manda el estado que ve
 * y no hay que resolver conflictos entre añadidos y quitados concurrentes.
 */
export async function updateGrants(req: Request, res: Response) {
  try {
    const uid = req.params.uid as string;
    const performer = (req as AuthenticatedRequest).user;
    const body = req.body as {
      grants?: unknown;
      revocations?: unknown;
    };

    const reason = readReason(req.body);
    if (!reason) {
      res.status(400).json({
        success: false,
        error: `A reason is required (1-${MAX_REASON} chars)`,
      });
      return;
    }

    if (!Array.isArray(body.grants) || !Array.isArray(body.revocations)) {
      res.status(400).json({
        success: false,
        error: "grants and revocations must both be arrays",
      });
      return;
    }

    if (
      body.grants.length > MAX_GRANTS ||
      body.revocations.length > MAX_GRANTS
    ) {
      res.status(400).json({
        success: false,
        error: `At most ${MAX_GRANTS} entries each`,
      });
      return;
    }

    if (uid === performer.uid) {
      res.status(400).json({
        success: false,
        error: "Cannot change your own permissions",
      });
      return;
    }

    const grants: PermissionGrant[] = [];
    for (const raw of body.grants as IncomingGrant[]) {
      if (!raw || typeof raw !== "object" || !isPermission(raw.permission)) {
        res
          .status(400)
          .json({ success: false, error: "Unknown permission in grants" });
        return;
      }

      // La regla de no escalada, aplicada permiso a permiso.
      if (!canGrant(performer.permissions, raw.permission)) {
        res.status(403).json({
          success: false,
          error: `You cannot grant a permission you do not hold: ${raw.permission}`,
        });
        return;
      }

      const scope =
        typeof raw.scope === "string" && raw.scope.length > 0
          ? raw.scope
          : GLOBAL_SCOPE;

      let expiresAt: Date | null = null;
      if (raw.expiresAt !== null && raw.expiresAt !== undefined) {
        const parsed = new Date(raw.expiresAt as string);
        if (Number.isNaN(parsed.getTime())) {
          res
            .status(400)
            .json({ success: false, error: "Invalid expiresAt date" });
          return;
        }
        expiresAt = parsed;
      }

      grants.push({
        permission: raw.permission,
        scope,
        expiresAt,
        grantedBy: performer.uid,
        grantedAt: new Date(),
        reason,
      });
    }

    const revocations: Permission[] = [];
    for (const raw of body.revocations) {
      if (!isPermission(raw)) {
        res
          .status(400)
          .json({ success: false, error: "Unknown permission in revocations" });
        return;
      }
      revocations.push(raw);
    }

    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    if (!actorDominates(performer.permissions, userDoc.data()?.role)) {
      res.status(403).json({
        success: false,
        error: "Cannot manage a user whose role exceeds your own permissions",
      });
      return;
    }

    const batch = admin.firestore().batch();
    batch.update(userRef, { grants, revocations });
    await commitWithAuditLog(
      batch,
      {
        action: "user.grants.change",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "user",
        details: {
          grants: grants.map((g) => ({
            permission: g.permission,
            scope: g.scope,
            expiresAt: g.expiresAt ? (g.expiresAt as Date).toISOString() : null,
          })),
          revocations,
          reason,
        },
      },
      req
    );

    res.json({ success: true, data: { uid, grants, revocations } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

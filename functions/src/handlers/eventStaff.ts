import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { commitWithAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  ROLE_BUNDLES,
  STAFF_CAPABILITY_IDS,
  canGrant,
  capabilitiesFromPermissions,
  isNotExpired,
  isRole,
  permissionsForCapabilities,
  readStaffPermissions,
  type Role,
  type StaffCapability,
} from "../auth/permissions";
import { eventStaffAssignSchema } from "../schemas";

/**
 * Roles cuyos permisos dependen de estar asignado a un evento. Asignar a
 * alguien con otro rol no haría nada: sus permisos ya son globales o
 * inexistentes, así que se rechaza en vez de dejar un documento inerte que
 * aparente conceder algo.
 */
const SCOPED_ROLES: Role[] = (Object.keys(ROLE_BUNDLES) as Role[]).filter(
  (role) => ROLE_BUNDLES[role].perEvent.length > 0
);

/** Lista quién puede operar un evento concreto. */
export async function listStaff(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const snapshot = await admin
      .firestore()
      .collection("events")
      .doc(slug)
      .collection("staff")
      .get();

    const nowMs = Date.now();
    const staff = snapshot.docs.map((doc) => {
      const data = doc.data();
      const permissions = readStaffPermissions(data.permissions);
      return {
        uid: doc.id,
        ...data,
        // `null` = todo el paquete del rol: asignaciones anteriores a las
        // capacidades. El panel las enseña como tal.
        permissions,
        capabilities: capabilitiesFromPermissions(permissions),
        // Una asignación caducada sigue en la base pero ya no concede nada;
        // el panel debe distinguirlas o mentiría sobre quién tiene acceso.
        active: isNotExpired(data.expiresAt, nowMs),
      };
    });

    res.json({ success: true, data: staff });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function assignStaff(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const uid = req.params.uid as string;
    const performer = (req as AuthenticatedRequest).user;

    // Parsed here and not only by a route middleware: the handler is the one
    // place every caller crosses, tests included.
    const parsed = eventStaffAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error:
          "Elige al menos una capacidad e indica el motivo (1-500 caracteres).",
        issues: parsed.error.issues.slice(0, 5).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    const body = parsed.data;
    const reason = body.reason;
    const capabilities = [...new Set(body.capabilities)].sort(
      (a, b) =>
        STAFF_CAPABILITY_IDS.indexOf(a) - STAFF_CAPABILITY_IDS.indexOf(b)
    ) as StaffCapability[];
    const permissions = permissionsForCapabilities(capabilities);

    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const targetRole = userDoc.data()?.role;
    if (!isRole(targetRole) || !SCOPED_ROLES.includes(targetRole)) {
      res.status(400).json({
        success: false,
        error: `Only these roles gain permissions from an assignment: ${SCOPED_ROLES.join(", ")}`,
      });
      return;
    }

    // Una capacidad que el rol no alcanza por evento no concedería nada, y
    // ninguna puede repartirla quien no la tiene (regla de no escalada).
    const outsideRole = permissions.filter(
      (p) => !ROLE_BUNDLES[targetRole].perEvent.includes(p)
    );
    if (outsideRole.length > 0) {
      res.status(400).json({
        success: false,
        error: `This role cannot be given: ${outsideRole.join(", ")}`,
      });
      return;
    }
    const notHeld = permissions.filter(
      (p) => !canGrant(performer.permissions, p)
    );
    if (notHeld.length > 0) {
      res.status(403).json({
        success: false,
        error: "Cannot grant permissions you do not hold",
      });
      return;
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt !== null && body.expiresAt !== undefined) {
      const parsed = new Date(body.expiresAt as string);
      if (Number.isNaN(parsed.getTime())) {
        res
          .status(400)
          .json({ success: false, error: "Invalid expiresAt date" });
        return;
      }
      expiresAt = parsed;
    }

    // Asignar staff concede permisos dentro del evento, así que se registra con
    // la misma atomicidad que un cambio de rol: o queda la asignación con su
    // constancia, o no queda ninguna de las dos.
    const staffRef = db
      .collection("events")
      .doc(slug)
      .collection("staff")
      .doc(uid);
    // Para la auditoría: qué podía hacer antes, si ya estaba asignada.
    const previous = await staffRef.get();
    const previousPermissions = previous.exists
      ? readStaffPermissions(previous.data()?.permissions)
      : undefined;

    const batch = db.batch();
    batch.set(staffRef, {
      uid,
      role: targetRole,
      // Los permisos y no las capacidades: es lo que las reglas comprueban
      // con `perm in …`, sin una tercera copia del catálogo.
      permissions,
      assignedBy: performer.uid,
      assignedAt: FieldValue.serverTimestamp(),
      expiresAt,
      reason,
    });
    await commitWithAuditLog(
      batch,
      {
        action: "event.staff.assign",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "event_staff",
        details: {
          eventSlug: slug,
          role: targetRole,
          capabilities,
          permissions,
          // `null` = la asignación anterior no tenía lista (todo el paquete);
          // ausente = no estaba asignada.
          ...(previousPermissions !== undefined ? { previousPermissions } : {}),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          reason,
        },
      },
      req
    );

    res.status(201).json({ success: true, data: { uid, eventSlug: slug } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function removeStaff(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const uid = req.params.uid as string;
    const performer = (req as AuthenticatedRequest).user;

    const ref = admin
      .firestore()
      .collection("events")
      .doc(slug)
      .collection("staff")
      .doc(uid);

    if (!(await ref.get()).exists) {
      res.status(404).json({ success: false, error: "Assignment not found" });
      return;
    }

    const batch = admin.firestore().batch();
    batch.delete(ref);
    await commitWithAuditLog(
      batch,
      {
        action: "event.staff.remove",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "event_staff",
        details: { eventSlug: slug },
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Eventos que la persona autenticada tiene asignados. El panel lo necesita
 * para enseñarle a un voluntario dónde puede trabajar: sus permisos no
 * existen a alcance global, así que sin esta lista vería el panel vacío.
 */
export async function listMyEvents(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const snapshot = await admin
      .firestore()
      .collectionGroup("staff")
      .where("uid", "==", user.uid)
      .get();

    const nowMs = Date.now();
    const events = snapshot.docs
      .filter((doc) => isNotExpired(doc.data()?.expiresAt, nowMs))
      // El padre de `staff` es el doc del evento; su id es el slug.
      .map((doc) => ({
        eventSlug: doc.ref.parent.parent?.id ?? null,
        role: doc.data()?.role ?? null,
        expiresAt: doc.data()?.expiresAt ?? null,
        // Qué puede hacer ahí; `null` = todo el paquete de su rol.
        permissions: readStaffPermissions(doc.data()?.permissions),
      }))
      .filter((entry) => entry.eventSlug !== null);

    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

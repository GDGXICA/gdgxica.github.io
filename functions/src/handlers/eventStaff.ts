import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  ROLE_BUNDLES,
  isNotExpired,
  isRole,
  type Role,
} from "../auth/permissions";

/**
 * Roles cuyos permisos dependen de estar asignado a un evento. Asignar a
 * alguien con otro rol no haría nada: sus permisos ya son globales o
 * inexistentes, así que se rechaza en vez de dejar un documento inerte que
 * aparente conceder algo.
 */
const SCOPED_ROLES: Role[] = (Object.keys(ROLE_BUNDLES) as Role[]).filter(
  (role) => ROLE_BUNDLES[role].perEvent.length > 0
);

const MAX_REASON = 500;

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
      return {
        uid: doc.id,
        ...data,
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
    const body = req.body as { expiresAt?: unknown; reason?: unknown };

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length === 0 || reason.length > MAX_REASON) {
      res.status(400).json({
        success: false,
        error: `A reason is required (1-${MAX_REASON} chars)`,
      });
      return;
    }

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

    await db.collection("events").doc(slug).collection("staff").doc(uid).set({
      uid,
      role: targetRole,
      assignedBy: performer.uid,
      assignedAt: FieldValue.serverTimestamp(),
      expiresAt,
      reason,
    });

    await writeAuditLog({
      action: "event.staff.assign",
      performedBy: performer.uid,
      targetId: uid,
      targetType: "event_staff",
      details: {
        eventSlug: slug,
        role: targetRole,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        reason,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

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

    await ref.delete();

    await writeAuditLog({
      action: "event.staff.remove",
      performedBy: performer.uid,
      targetId: uid,
      targetType: "event_staff",
      details: { eventSlug: slug },
      timestamp: FieldValue.serverTimestamp(),
    });

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
      }))
      .filter((entry) => entry.eventSlug !== null);

    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

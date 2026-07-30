import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  commitWithAuditLog,
  mirrorToCloudLogging,
  stageAuditLog,
  writeAuditLog,
} from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  canAssignRole,
  isNotExpired,
  isRole,
  type Role,
} from "../auth/permissions";
import {
  actorDominates,
  activeAdminsQuery,
  countActiveAdmins,
  countActiveAdminsIn,
} from "../auth/guards";
import {
  sendAccessDecisionEmail,
  sendInvitationEmail,
} from "../services/email";
import { SITE_ORIGIN } from "../config";

const MAX_TEXT = 1000;
const MAX_NOTE = 500;
const INVITE_TTL_DAYS = 14;

/** Roles que se pueden pedir o invitar. `admin` nunca: se otorga a mano. */
const REQUESTABLE_ROLES: Role[] = ["contributor", "volunteer", "organizer"];

const ROLE_LABELS: Record<Role, string> = {
  member: "Miembro",
  contributor: "Colaborador externo",
  volunteer: "Voluntario de evento",
  organizer: "Organizador",
  admin: "Administrador",
};

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Comparación en tiempo constante de los hashes. Aunque el hash ya no es el
 * secreto, comparar con `===` filtra por temporización cuántos caracteres
 * coinciden, y no cuesta nada evitarlo.
 */
function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Estos dos endpoints los alcanza cualquiera con una sesión de Firebase,
 * incluidas las anónimas que el /join de minijuegos crea sin coste. Una
 * cuenta anónima no tiene correo, así que no hay a quién avisar ni con quién
 * cotejar una invitación: se rechaza antes de tocar la base.
 *
 * Devuelve `true` si ya respondió.
 */
function rejectUnverified(
  user: AuthenticatedRequest["user"],
  res: Response
): boolean {
  if (!user.email || !user.emailVerified) {
    res.status(403).json({
      success: false,
      error: "A verified email address is required",
    });
    return true;
  }
  return false;
}

// ─────────────────────────── Solicitudes ───────────────────────────

/**
 * Alguien que ya inició sesión pide acceso. El id del documento es su uid,
 * así que no puede acumular solicitudes: reenviar sustituye la anterior.
 */
export async function createRequest(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (rejectUnverified(user, res)) return;

    const body = req.body as {
      requestedRole?: unknown;
      motivo?: unknown;
      links?: unknown;
      eventSlug?: unknown;
    };

    if (
      !isRole(body.requestedRole) ||
      !REQUESTABLE_ROLES.includes(body.requestedRole)
    ) {
      res.status(400).json({
        success: false,
        error: `requestedRole must be one of: ${REQUESTABLE_ROLES.join(", ")}`,
      });
      return;
    }

    const motivo = readText(body.motivo, MAX_TEXT);
    if (!motivo) {
      res.status(400).json({
        success: false,
        error: `motivo is required (1-${MAX_TEXT} chars)`,
      });
      return;
    }

    const links = readText(body.links, MAX_TEXT) ?? "";
    const eventSlug = readText(body.eventSlug, 100) ?? null;

    const ref = admin.firestore().collection("access_requests").doc(user.uid);
    const existing = await ref.get();

    // Una decisión ya tomada no se puede reabrir reenviando el formulario:
    // eso permitiría insistir hasta colar una aprobación por cansancio.
    if (existing.exists && existing.data()?.status === "approved") {
      res.status(409).json({
        success: false,
        error: "Your request was already approved",
      });
      return;
    }

    await ref.set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      requestedRole: body.requestedRole,
      motivo,
      links,
      eventSlug,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    });

    res.status(201).json({ success: true, data: { status: "pending" } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** La persona consulta el estado de SU solicitud. */
export async function getMyRequest(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const doc = await admin
      .firestore()
      .collection("access_requests")
      .doc(user.uid)
      .get();
    res.json({ success: true, data: doc.exists ? doc.data() : null });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function listRequests(req: Request, res: Response) {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status : "pending";
    const snapshot = await admin
      .firestore()
      .collection("access_requests")
      .where("status", "==", status)
      .get();

    // Se ordena en memoria: la colección es pequeña (una entrada por
    // persona) y así evitamos un índice compuesto más.
    const requests = snapshot.docs
      .map((d) => d.data())
      .sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      );

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function decideRequest(req: Request, res: Response) {
  try {
    const uid = req.params.uid as string;
    const performer = (req as AuthenticatedRequest).user;
    const body = req.body as {
      approve?: unknown;
      role?: unknown;
      note?: unknown;
    };

    if (typeof body.approve !== "boolean") {
      res
        .status(400)
        .json({ success: false, error: "approve must be a boolean" });
      return;
    }

    const note = readText(body.note, MAX_NOTE);
    if (!note) {
      res.status(400).json({
        success: false,
        error: `A note is required (1-${MAX_NOTE} chars)`,
      });
      return;
    }

    if (uid === performer.uid) {
      res
        .status(400)
        .json({ success: false, error: "Cannot review your own request" });
      return;
    }

    const db = admin.firestore();
    const requestRef = db.collection("access_requests").doc(uid);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      res.status(404).json({ success: false, error: "Request not found" });
      return;
    }
    if (requestDoc.data()?.status !== "pending") {
      res
        .status(409)
        .json({ success: false, error: "Request was already reviewed" });
      return;
    }

    // El rol concedido puede diferir del pedido: se aprueba lo que hace
    // falta, no lo que se pidió.
    const granted = isRole(body.role)
      ? body.role
      : requestDoc.data()?.requestedRole;

    /** Rol que la persona tenía antes de aprobarle la solicitud. */
    let currentRole: unknown = null;

    if (body.approve) {
      if (!isRole(granted) || !REQUESTABLE_ROLES.includes(granted)) {
        res.status(400).json({
          success: false,
          error: `role must be one of: ${REQUESTABLE_ROLES.join(", ")}`,
        });
        return;
      }
      // Misma regla de no escalada que en la gestión de usuarios: aprobar
      // una solicitud no es una puerta trasera para repartir permisos.
      if (!canAssignRole(performer.permissions, granted)) {
        res.status(403).json({
          success: false,
          error: "Cannot grant a role that exceeds your own permissions",
        });
        return;
      }

      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        res
          .status(404)
          .json({ success: false, error: "User account not found" });
        return;
      }

      // Aprobar una solicitud SUSTITUYE el rol que la persona ya tenía, así
      // que pasa por las mismas guardas que un cambio de rol en el panel. Sin
      // esto, aprobar una solicitud vieja de quien entretanto llegó a admin lo
      // degradaba sin más, y si era el último dejaba la plataforma sin nadie
      // capaz de administrarla.
      currentRole = userDoc.data()?.role;
      if (!actorDominates(performer.permissions, currentRole)) {
        res.status(403).json({
          success: false,
          error: "Cannot manage a user whose role exceeds your own permissions",
        });
        return;
      }

      if (currentRole === "admin" && granted !== "admin") {
        if ((await countActiveAdmins()) <= 1) {
          res.status(400).json({
            success: false,
            error: "Cannot demote the last active admin",
          });
          return;
        }
      }
    }

    const batch = db.batch();
    if (body.approve) {
      batch.update(db.collection("users").doc(uid), { role: granted });
    }
    batch.update(requestRef, {
      status: body.approve ? "approved" : "rejected",
      reviewedBy: performer.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: note,
      grantedRole: body.approve ? granted : null,
    });

    await commitWithAuditLog(
      batch,
      {
        action: body.approve
          ? "access.request.approve"
          : "access.request.reject",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "access_request",
        details: {
          grantedRole: body.approve ? granted : null,
          previousRole: currentRole ?? null,
          reason: note,
        },
      },
      req
    );

    // El correo no debe tumbar la operación: la decisión ya está tomada y
    // registrada, y un fallo de Gmail no puede deshacerla.
    const email = requestDoc.data()?.email;
    if (typeof email === "string" && email) {
      sendAccessDecisionEmail({
        to: email,
        approved: body.approve,
        roleLabel: isRole(granted) ? ROLE_LABELS[granted] : undefined,
        note,
      }).catch((err) => logger.warn("Access decision email failed", err));
    }

    res.json({ success: true, data: { uid, approved: body.approve } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// ─────────────────────────── Invitaciones ───────────────────────────

export async function listInvitations(_req: Request, res: Response) {
  try {
    const snapshot = await admin
      .firestore()
      .collection("invitations")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    // `tokenHash` no sale nunca de aquí: con él no se puede canjear, pero
    // tampoco tiene por qué pasearse por la red.
    const invitations = snapshot.docs.map((d) => {
      const { tokenHash: _ignored, ...rest } = d.data();
      return { id: d.id, ...rest };
    });

    res.json({ success: true, data: invitations });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function createInvitation(req: Request, res: Response) {
  try {
    const performer = (req as AuthenticatedRequest).user;
    const body = req.body as { email?: unknown; role?: unknown };

    const email = readText(body.email, 320);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res
        .status(400)
        .json({ success: false, error: "A valid email is required" });
      return;
    }

    if (!isRole(body.role) || !REQUESTABLE_ROLES.includes(body.role)) {
      res.status(400).json({
        success: false,
        error: `role must be one of: ${REQUESTABLE_ROLES.join(", ")}`,
      });
      return;
    }

    if (!canAssignRole(performer.permissions, body.role)) {
      res.status(403).json({
        success: false,
        error: "Cannot invite to a role that exceeds your own permissions",
      });
      return;
    }

    // 32 bytes de entropía criptográfica. En Firestore solo queda el hash:
    // quien pueda leer la colección no puede canjear nada.
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);

    const ref = await admin
      .firestore()
      .collection("invitations")
      .add({
        emailLower: email.toLowerCase(),
        role: body.role,
        tokenHash: hashToken(token),
        expiresAt,
        usedAt: null,
        usedBy: null,
        revokedAt: null,
        createdBy: performer.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

    await writeAuditLog({
      action: "access.invitation.create",
      performedBy: performer.uid,
      targetId: ref.id,
      targetType: "invitation",
      details: { email: email.toLowerCase(), role: body.role },
      timestamp: FieldValue.serverTimestamp(),
    });

    const url = `${SITE_ORIGIN}/admin/invitacion?token=${token}`;
    try {
      await sendInvitationEmail({
        to: email,
        roleLabel: ROLE_LABELS[body.role],
        url,
        invitedBy: performer.displayName || performer.email,
        expiresAt,
      });
    } catch (err) {
      // A diferencia de la decisión, aquí el correo ES la entrega: si no
      // sale, se avisa para poder reenviar en vez de dar por hecho que la
      // persona recibió el enlace.
      logger.error("Invitation email failed", err);
      res.status(502).json({
        success: false,
        error: "Invitation created but the email could not be sent",
      });
      return;
    }

    res.status(201).json({ success: true, data: { id: ref.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function revokeInvitation(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const performer = (req as AuthenticatedRequest).user;

    const ref = admin.firestore().collection("invitations").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: "Invitation not found" });
      return;
    }
    if (doc.data()?.usedAt) {
      res
        .status(409)
        .json({ success: false, error: "Invitation was already used" });
      return;
    }

    await ref.update({ revokedAt: FieldValue.serverTimestamp() });

    await writeAuditLog({
      action: "access.invitation.revoke",
      performedBy: performer.uid,
      targetId: id,
      targetType: "invitation",
      details: {},
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Canjea una invitación. Exige que el correo verificado de quien la canjea
 * coincida con el invitado: sin esa comprobación, cualquiera con el enlace
 * —reenviado, filtrado de una bandeja— se llevaría el rol.
 */
export async function redeemInvitation(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    // El canje se decide comparando correos, así que uno sin verificar no
    // vale: solo dice qué escribió quien se registró, no de quién es.
    if (rejectUnverified(user, res)) return;

    const token = readText((req.body as { token?: unknown })?.token, 200);

    if (!token) {
      res.status(400).json({ success: false, error: "A token is required" });
      return;
    }

    const db = admin.firestore();
    const tokenHash = hashToken(token);
    const snapshot = await db
      .collection("invitations")
      .where("emailLower", "==", (user.email || "").toLowerCase())
      .get();

    const match = snapshot.docs.find((d) =>
      hashesMatch(String(d.data()?.tokenHash ?? ""), tokenHash)
    );

    // Un único mensaje para "no existe", "no es tuya", "caducada" y "ya
    // usada": distinguirlos convierte el endpoint en un oráculo para
    // sondear invitaciones ajenas.
    const invalid = () =>
      res.status(400).json({
        success: false,
        error: "Invitation is invalid, expired or already used",
      });

    if (!match) {
      invalid();
      return;
    }

    const data = match.data();
    if (
      data.usedAt ||
      data.revokedAt ||
      !isNotExpired(data.expiresAt, Date.now())
    ) {
      invalid();
      return;
    }
    if (!isRole(data.role) || !REQUESTABLE_ROLES.includes(data.role)) {
      invalid();
      return;
    }

    const userRef = db.collection("users").doc(user.uid);
    if (!(await userRef.get()).exists) {
      res.status(404).json({ success: false, error: "User account not found" });
      return;
    }

    // Transacción para que dos canjes simultáneos del mismo enlace no
    // aplique el rol dos veces ni deje la invitación sin marcar.
    //
    // El registro de auditoría se confirma DENTRO de la transacción, no después:
    // canjear una invitación cambia el rol de quien canjea, y si la instancia
    // moría entre el commit y la escritura del registro, quedaba una elevación
    // de permisos sin rastro alguno. Firestore exige que todas las lecturas
    // vayan antes de todas las escrituras, de ahí el orden de abajo.
    const stored = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(match.ref);
      const freshData = fresh.data();
      if (freshData?.usedAt || freshData?.revokedAt) {
        throw new Error("ALREADY_USED");
      }

      // El rol actual se lee aquí y no fuera: canjear SUSTITUYE el rol, y una
      // invitación de organizador al correo de un admin lo degradaba en
      // silencio. La cuenta de admins también va dentro, porque una lectura
      // suelta no entra en la transacción y dos canjes a la vez podrían pasar
      // los dos la comprobación y dejar la plataforma con cero admins.
      const userSnap = await tx.get(userRef);
      const currentRole = userSnap.data()?.role;
      if (currentRole === "admin" && data.role !== "admin") {
        if (countActiveAdminsIn(await tx.get(activeAdminsQuery())) <= 1) {
          throw new Error("LAST_ADMIN");
        }
      }

      tx.update(match.ref, {
        usedAt: FieldValue.serverTimestamp(),
        usedBy: user.uid,
      });
      tx.update(userRef, { role: data.role });

      return stageAuditLog(
        tx,
        {
          action: "access.invitation.redeem",
          performedBy: user.uid,
          targetId: match.id,
          targetType: "invitation",
          details: { role: data.role, previousRole: currentRole ?? null },
        },
        req
      );
    });

    // Fuera de la transacción a propósito: el callback se puede reintentar, y
    // espejar dentro dejaría una línea por intento.
    mirrorToCloudLogging(stored, req);

    res.json({ success: true, data: { role: data.role } });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_USED") {
      res.status(400).json({
        success: false,
        error: "Invitation is invalid, expired or already used",
      });
      return;
    }
    // Este SÍ dice qué pasó, al contrario que el mensaje opaco de arriba. Ese
    // es opaco para no convertir el endpoint en un oráculo de invitaciones
    // ajenas; aquí no hay nada que filtrar —quien canjea es el último admin y
    // ya lo sabe— y un error genérico le haría pensar que el enlace está roto.
    if (err instanceof Error && err.message === "LAST_ADMIN") {
      res.status(400).json({
        success: false,
        error:
          "Canjear esta invitación te quitaría el rol de administrador y no " +
          "queda ningún otro activo. Pide que asciendan a otra persona antes.",
      });
      return;
    }
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

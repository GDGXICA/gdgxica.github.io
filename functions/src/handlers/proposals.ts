import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog, triggerRebuildAndLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { eventSchema, speakerSchema } from "../schemas";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";
import {
  eventExists,
  publishEvent,
  publishSpeaker,
  speakerExists,
} from "../services/publish";

const MAX_NOTE = 500;
const MAX_OPEN_PROPOSALS = 10;

type ProposalType = "event" | "speaker";

/** Estados desde los que quien propone todavía puede editar. */
const EDITABLE = new Set(["draft", "changes_requested"]);

function isProposalType(value: unknown): value is ProposalType {
  return value === "event" || value === "speaker";
}

function readNote(body: unknown, required: boolean): string | null | undefined {
  const note = (body as { note?: unknown })?.note;
  if (typeof note !== "string") return required ? undefined : null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return required ? undefined : null;
  if (trimmed.length > MAX_NOTE) return undefined;
  return trimmed;
}

/**
 * Valida el contenido contra el mismo esquema que usa la creación directa.
 * Se ejecuta al enviar Y al publicar: entre ambos momentos pueden pasar días
 * y el esquema puede haber cambiado, así que publicar sin revalidar metería
 * en el repo de datos algo que hoy ya no es válido.
 */
function validatePayload(type: ProposalType, payload: unknown) {
  const schema = type === "event" ? eventSchema : speakerSchema;
  return schema.safeParse(payload);
}

/** Quien propone ve las suyas; quien revisa, todas. */
export async function listProposals(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const canReview = user.permissions.has("proposals:review");

    const collection = admin.firestore().collection("proposals");
    const snapshot = canReview
      ? await collection.get()
      : await collection.where("createdBy", "==", user.uid).get();

    const proposals = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort(
        (a, b) =>
          ((
            b as { createdAt?: { toMillis?: () => number } }
          ).createdAt?.toMillis?.() ?? 0) -
          ((
            a as { createdAt?: { toMillis?: () => number } }
          ).createdAt?.toMillis?.() ?? 0)
      );

    res.json({ success: true, data: proposals });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function createProposal(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as { type?: unknown; payload?: unknown };

    if (!isProposalType(body.type)) {
      res
        .status(400)
        .json({ success: false, error: 'type must be "event" or "speaker"' });
      return;
    }

    const parsed = validatePayload(body.type, body.payload);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: `Invalid ${body.type}: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
      });
      return;
    }

    // Tope de propuestas abiertas por persona: sin él, una cuenta de
    // colaborador puede llenar la cola de revisión sin coste alguno.
    const open = await admin
      .firestore()
      .collection("proposals")
      .where("createdBy", "==", user.uid)
      .get();
    const openCount = open.docs.filter(
      (d) => !["published", "rejected"].includes(String(d.data()?.status))
    ).length;
    if (openCount >= MAX_OPEN_PROPOSALS) {
      res.status(429).json({
        success: false,
        error: `You already have ${MAX_OPEN_PROPOSALS} open proposals`,
      });
      return;
    }

    const ref = await admin.firestore().collection("proposals").add({
      type: body.type,
      payload: parsed.data,
      status: "submitted",
      createdBy: user.uid,
      createdByEmail: user.email,
      createdByName: user.displayName,
      createdAt: FieldValue.serverTimestamp(),
      submittedAt: FieldValue.serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      publishedAt: null,
    });

    res.status(201).json({ success: true, data: { id: ref.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/** Quien propone corrige su borrador tras un "requiere cambios". */
export async function updateProposal(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as { payload?: unknown };

    const ref = admin.firestore().collection("proposals").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: "Proposal not found" });
      return;
    }

    const data = doc.data() ?? {};
    if (data.createdBy !== user.uid) {
      res.status(403).json({ success: false, error: "Not your proposal" });
      return;
    }
    if (!EDITABLE.has(String(data.status))) {
      res.status(409).json({
        success: false,
        error: "This proposal can no longer be edited",
      });
      return;
    }

    const parsed = validatePayload(data.type as ProposalType, body.payload);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: `Invalid payload: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
      });
      return;
    }

    await ref.update({
      payload: parsed.data,
      status: "submitted",
      submittedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Revisa una propuesta: aprobar, pedir cambios o rechazar. Aprobar NO
 * publica; publicar es un segundo paso explícito, para que aceptar el
 * contenido y escribirlo en el repo de datos sean decisiones separadas.
 */
export async function reviewProposal(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const performer = (req as AuthenticatedRequest).user;
    const body = req.body as { decision?: unknown };

    const decision = body.decision;
    if (
      decision !== "approved" &&
      decision !== "changes_requested" &&
      decision !== "rejected"
    ) {
      res.status(400).json({
        success: false,
        error: "decision must be one of: approved, changes_requested, rejected",
      });
      return;
    }

    // Aprobar puede ir sin comentario; pedir cambios o rechazar, no: quien
    // propone necesita saber qué corregir.
    const note = readNote(req.body, decision !== "approved");
    if (note === undefined) {
      res.status(400).json({
        success: false,
        error: `A note is required for this decision (1-${MAX_NOTE} chars)`,
      });
      return;
    }

    const ref = admin.firestore().collection("proposals").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: "Proposal not found" });
      return;
    }

    const data = doc.data() ?? {};
    if (data.createdBy === performer.uid) {
      res
        .status(400)
        .json({ success: false, error: "Cannot review your own proposal" });
      return;
    }
    if (data.status === "published") {
      res
        .status(409)
        .json({ success: false, error: "Proposal was already published" });
      return;
    }

    await ref.update({
      status: decision,
      reviewedBy: performer.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: note,
    });

    await writeAuditLog({
      action: "proposal.review",
      performedBy: performer.uid,
      targetId: id,
      targetType: "proposal",
      details: { decision, type: data.type, reason: note },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id, status: decision } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * Publica una propuesta aprobada en el repo de datos.
 *
 * Corre siempre bajo la identidad de quien publica, nunca la de quien
 * propuso: el commit y la entrada de auditoría deben señalar a quien tomó la
 * decisión de sacarlo al sitio público.
 */
export async function publishProposal(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const performer = (req as AuthenticatedRequest).user;

    const ref = admin.firestore().collection("proposals").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: "Proposal not found" });
      return;
    }

    const data = doc.data() ?? {};
    if (data.status !== "approved") {
      res.status(409).json({
        success: false,
        error: "Only an approved proposal can be published",
      });
      return;
    }
    if (!isProposalType(data.type)) {
      res
        .status(422)
        .json({ success: false, error: "Proposal has an unknown type" });
      return;
    }

    // Revalidación en el momento de escribir, no solo al enviar.
    const parsed = validatePayload(data.type, data.payload);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: `Proposal no longer passes validation: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      });
      return;
    }

    const github = new GitHubService(GITHUB_TOKEN.value());
    const payload = parsed.data as Record<string, unknown>;
    const targetId = payload.id as string;

    // Publicar no puede pisar contenido existente: el id lo eligió quien
    // propuso, y una colisión sobrescribiría un evento real.
    const collides =
      data.type === "event"
        ? await eventExists(github, targetId)
        : await speakerExists(github, targetId);
    if (collides) {
      res.status(409).json({
        success: false,
        error: `An ${data.type} with id "${targetId}" already exists`,
      });
      return;
    }

    if (data.type === "event") {
      await publishEvent(github, payload);
    } else {
      await publishSpeaker(github, {
        ...payload,
        id: targetId,
        name: payload.name as string,
      });
    }

    triggerRebuildAndLog(github);

    await ref.update({
      status: "published",
      publishedAt: FieldValue.serverTimestamp(),
      publishedBy: performer.uid,
    });

    await writeAuditLog({
      action: "proposal.publish",
      performedBy: performer.uid,
      targetId: id,
      targetType: "proposal",
      details: {
        type: data.type,
        publishedId: targetId,
        proposedBy: data.createdBy,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: { id, publishedId: targetId } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

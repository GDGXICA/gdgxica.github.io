import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import type { MinigameTemplate } from "../schemas";

const COLLECTION = "minigame_templates";

interface AuditDetails {
  type: MinigameTemplate["type"];
  title: string;
  version?: number;
}

function auditEntry(
  action: string,
  performedBy: string,
  targetId: string,
  details: AuditDetails
) {
  return {
    action,
    performedBy,
    targetId,
    targetType: "minigame_template",
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export async function list(_req: Request, res: Response) {
  try {
    const snap = await admin
      .firestore()
      .collection(COLLECTION)
      .orderBy("updatedAt", "desc")
      .get();
    res.json({
      success: true,
      data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as MinigameTemplate;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await admin
      .firestore()
      .collection(COLLECTION)
      .add({
        ...body,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        version: 1,
      });
    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry("minigame_template.create", user.uid, ref.id, {
          type: body.type,
          title: body.title,
        })
      );
    res.status(201).json({ success: true, data: { id: ref.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as MinigameTemplate;
    const ref = admin.firestore().collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Minigame template not found" });
      return;
    }
    const prevVersion = (snap.data()?.version as number | undefined) ?? 0;
    const nextVersion = prevVersion + 1;
    await ref.set(
      {
        ...body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: nextVersion,
      },
      { merge: true }
    );
    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry("minigame_template.update", user.uid, id, {
          type: body.type,
          title: body.title,
          version: nextVersion,
        })
      );
    res.json({ success: true, data: { id, version: nextVersion } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const ref = admin.firestore().collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Minigame template not found" });
      return;
    }
    const data = snap.data() as Partial<MinigameTemplate> | undefined;
    await ref.delete();
    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry("minigame_template.delete", user.uid, id, {
          type: data?.type ?? "poll",
          title: data?.title ?? id,
        })
      );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

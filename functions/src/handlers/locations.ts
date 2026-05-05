import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  safeError,
  validateUrl,
  validateMapEmbedUrl,
} from "../middleware/validate";

export async function list(_req: Request, res: Response) {
  try {
    const snap = await admin
      .firestore()
      .collection("locations")
      .orderBy("createdAt", "desc")
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
    const { name, address, map_url, map_embed } = req.body;
    if (map_url && !validateUrl(map_url)) {
      res.status(400).json({ success: false, error: "Invalid map_url" });
      return;
    }
    if (map_embed && !validateMapEmbedUrl(map_embed)) {
      res.status(400).json({ success: false, error: "Invalid map_embed URL" });
      return;
    }
    const ref = await admin.firestore().collection("locations").add({
      name,
      address,
      map_url,
      map_embed,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: user.uid,
    });
    admin.firestore().collection("audit_log").add({
      action: "location.create",
      performedBy: user.uid,
      targetId: ref.id,
      targetType: "location",
      details: { name },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ success: true, data: { id: ref.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const { name, address, map_url, map_embed } = req.body;
    if (map_url && !validateUrl(map_url)) {
      res.status(400).json({ success: false, error: "Invalid map_url" });
      return;
    }
    if (map_embed && !validateMapEmbedUrl(map_embed)) {
      res.status(400).json({ success: false, error: "Invalid map_embed URL" });
      return;
    }
    const ref = admin.firestore().collection("locations").doc(id);
    if (!(await ref.get()).exists) {
      res.status(404).json({ success: false, error: "Location not found" });
      return;
    }
    await ref.update({ name, address, map_url, map_embed });
    admin.firestore().collection("audit_log").add({
      action: "location.update",
      performedBy: user.uid,
      targetId: id,
      targetType: "location",
      details: { name },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const ref = admin.firestore().collection("locations").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: "Location not found" });
      return;
    }
    const name = (doc.data()?.name as string) || id;
    await ref.delete();
    admin.firestore().collection("audit_log").add({
      action: "location.delete",
      performedBy: user.uid,
      targetId: id,
      targetType: "location",
      details: { name },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

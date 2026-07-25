import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AuthenticatedRequest } from "../middleware/auth";

export async function register(req: Request, res: Response) {
  try {
    const { user } = req as AuthenticatedRequest;
    const db = admin.firestore();
    const userRef = db.collection("users").doc(user.uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      await userRef.update({
        lastLoginAt: FieldValue.serverTimestamp(),
      });
      res.json({ success: true, data: userDoc.data() });
      return;
    }

    // `member` no da ningún permiso de panel: es solo "alguien que inició
    // sesión". Subir de ahí exige una solicitud aprobada o una invitación,
    // nunca el simple hecho de haber entrado con Google.
    const newUser = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      role: "member",
      status: "active",
      grants: [],
      revocations: [],
      createdAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    };

    await userRef.set(newUser);
    res.status(201).json({ success: true, data: newUser });
  } catch {
    res.status(500).json({ success: false, error: "Registration failed" });
  }
}

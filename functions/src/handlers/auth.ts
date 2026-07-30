import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AuthenticatedRequest } from "../middleware/auth";
import { commitWithAuditLog } from "../utils/audit";

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

    // Solo la creación deja constancia. La rama de arriba actualiza
    // `lastLoginAt` en CADA inicio de sesión: auditar eso daría una fila por
    // login y ahogaría el registro en ruido sin aportar nada — el alta de una
    // cuenta ocurre una vez, y es lo que interesa poder fechar.
    const batch = db.batch();
    batch.set(userRef, newUser);
    await commitWithAuditLog(
      batch,
      {
        action: "user.register",
        performedBy: user.uid,
        targetId: user.uid,
        targetType: "user",
        details: { role: "member", email: user.email || "" },
      },
      req
    );

    res.status(201).json({ success: true, data: newUser });
  } catch {
    res.status(500).json({ success: false, error: "Registration failed" });
  }
}

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

    const newUser = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      role: "member",
      createdAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    };

    await userRef.set(newUser);
    res.status(201).json({ success: true, data: newUser });
  } catch {
    res.status(500).json({ success: false, error: "Registration failed" });
  }
}

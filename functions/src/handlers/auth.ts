import { Request, Response } from "express";
import * as admin from "firebase-admin";

export async function register(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "No token provided" });
    return;
  }

  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const db = admin.firestore();
    const userRef = db.collection("users").doc(decoded.uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      await userRef.update({
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ success: true, data: userDoc.data() });
      return;
    }

    const newUser = {
      uid: decoded.uid,
      email: decoded.email || "",
      displayName: decoded.name || "",
      photoURL: decoded.picture || "",
      role: "member",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.set(newUser);
    res.status(201).json({ success: true, data: newUser });
  } catch {
    res.status(500).json({ success: false, error: "Registration failed" });
  }
}

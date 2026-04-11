import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { Role } from "../types/users";

const VALID_ROLES: Role[] = ["admin", "organizer", "member"];

export async function listUsers(_req: Request, res: Response) {
  try {
    const snapshot = await admin
      .firestore()
      .collection("users")
      .orderBy("createdAt", "desc")
      .get();

    const users = snapshot.docs.map((doc) => doc.data());
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateRole(req: Request, res: Response) {
  try {
    const uid = req.params.uid as string;
    const { role } = req.body;
    const performer = (req as AuthenticatedRequest).user;

    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({
        success: false,
        error: `Invalid role. Must be: ${VALID_ROLES.join(", ")}`,
      });
      return;
    }

    if (uid === performer.uid) {
      res
        .status(400)
        .json({ success: false, error: "Cannot change your own role" });
      return;
    }

    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    await userRef.update({ role });

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "user.role.change",
        performedBy: performer.uid,
        targetId: uid,
        targetType: "user",
        details: { newRole: role, previousRole: userDoc.data()?.role },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true, data: { uid, role } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

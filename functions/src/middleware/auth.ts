import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { Role, UserDocument } from "../types/users";

const ROLE_HIERARCHY: Record<Role, number> = {
  member: 0,
  organizer: 1,
  admin: 2,
};

export interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

export function requireRole(minimumRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "No token provided" });
      return;
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await admin.auth().verifyIdToken(token);

      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(decoded.uid)
        .get();

      if (!userDoc.exists) {
        res.status(403).json({ success: false, error: "User not registered" });
        return;
      }

      const user = userDoc.data() as UserDocument;

      if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minimumRole]) {
        res
          .status(403)
          .json({ success: false, error: "Insufficient permissions" });
        return;
      }

      (req as AuthenticatedRequest).user = user;
      next();
    } catch {
      res.status(401).json({ success: false, error: "Invalid token" });
    }
  };
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "No token provided" });
      return;
    }

    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await admin.auth().verifyIdToken(token);
      (req as AuthenticatedRequest).user = {
        uid: decoded.uid,
        email: decoded.email || "",
        displayName: decoded.name || "",
        photoURL: decoded.picture || "",
        role: "member",
      } as UserDocument;
      next();
    } catch {
      res.status(401).json({ success: false, error: "Invalid token" });
    }
  };
}

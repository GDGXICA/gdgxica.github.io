export type Role = "admin" | "organizer" | "member";

export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: Role;
  createdAt: import("firebase-admin/firestore").Timestamp;
  lastLoginAt: import("firebase-admin/firestore").Timestamp;
}

export interface AuditLogEntry {
  action: string;
  performedBy: string;
  targetId: string;
  targetType: string;
  details: Record<string, unknown>;
  timestamp: import("firebase-admin/firestore").Timestamp;
}

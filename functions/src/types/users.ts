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

import type { Timestamp } from "firebase-admin/firestore";
import type {
  PermissionGrant,
  Permission,
  Role,
  UserStatus,
} from "../auth/permissions";

// El catálogo de `auth/permissions` es la única definición de Role: se
// reexporta aquí para no tener dos listas de roles que se puedan desalinear.
export type { Permission, PermissionGrant, Role, UserStatus };

export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: Role;
  /** Ausente en docs anteriores a los permisos; se interpreta como "active". */
  status?: UserStatus;
  /** Permisos concedidos a esta persona por encima de su rol. */
  grants?: PermissionGrant[];
  /** Permisos retirados a esta persona pese a que su rol los incluya. */
  revocations?: Permission[];
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

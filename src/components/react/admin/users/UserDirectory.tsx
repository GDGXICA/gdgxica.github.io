import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { useAuth } from "../AuthProvider";

interface UserEntry {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: string;
  lastLoginAt: { _seconds: number };
}

const ROLES = ["member", "organizer", "admin"] as const;

export function UserDirectory() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const res = await api.listUsers();
    if (res.success && res.data) {
      setUsers(res.data as UserEntry[]);
    } else {
      setError(res.error || "Error al cargar usuarios");
    }
    setLoading(false);
  }

  async function handleRoleChange(uid: string, newRole: string) {
    if (
      !confirm(
        `Cambiar rol a "${newRole}"? Esto afecta los permisos del usuario.`
      )
    )
      return;

    setChangingRole(uid);
    const res = await api.updateUserRole(uid, newRole);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
      );
      setToast({ message: "Rol actualizado", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setChangingRole(null);
  }

  function formatDate(timestamp: { _seconds: number } | undefined) {
    if (!timestamp?._seconds) return "-";
    return new Date(timestamp._seconds * 1000).toLocaleDateString("es-PE");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <p className="mb-6 text-sm text-gray-500">
        {users.length} usuarios registrados
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Ultimo login
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.uid} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {user.photoURL && (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="h-8 w-8 rounded-full"
                      />
                    )}
                    <span className="font-medium text-gray-900">
                      {user.displayName}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {user.email}
                </td>
                <td className="px-6 py-4">
                  {isAdmin ? (
                    <select
                      value={user.role}
                      onChange={(e) =>
                        handleRoleChange(user.uid, e.target.value)
                      }
                      disabled={changingRole === user.uid}
                      className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {user.role}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDate(user.lastLoginAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

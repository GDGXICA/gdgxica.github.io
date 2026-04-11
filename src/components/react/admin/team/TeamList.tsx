import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toImagePath } from "@/lib/image";
import { Toast } from "../ui/Toast";
import { TeamMemberForm } from "./TeamMemberForm";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  photo_url: string;
  bio: string;
  social_links: Record<string, string>;
  type: "organizer" | "member";
  tags?: string[];
}

export function TeamList() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    setLoading(true);
    const res = await api.listTeam();
    if (res.success && res.data) {
      setMembers(res.data as TeamMember[]);
    } else {
      setError(res.error || "Error al cargar equipo");
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(`Eliminar miembro "${id}"?`)) return;
    setDeleting(id);
    const res = await api.deleteTeamMember(id);
    if (res.success) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setToast({ message: "Miembro eliminado", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setDeleting(null);
  }

  async function handleSave(member: TeamMember, isNew: boolean) {
    const res = isNew
      ? await api.addTeamMember(member)
      : await api.updateTeamMember(member.id, member);

    if (res.success) {
      setToast({
        message: `Miembro ${isNew ? "agregado" : "actualizado"}`,
        type: "success",
      });
      setEditing(null);
      setCreating(false);
      loadTeam();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (creating || editing) {
    return (
      <TeamMemberForm
        member={editing || undefined}
        onSave={handleSave}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  const organizers = members.filter((m) => m.type === "organizer");
  const teamMembers = members.filter((m) => m.type === "member");

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {members.length} miembros
        </p>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Agregar miembro
        </button>
      </div>

      {[
        { title: "Organizadores", items: organizers },
        { title: "Miembros", items: teamMembers },
      ].map((group) => (
        <div key={group.title} className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            {group.title} ({group.items.length})
          </h3>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Bio
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {group.items.map((member) => (
                  <tr
                    key={member.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={toImagePath(member.photo_url)}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {member.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {member.role}
                    </td>
                    <td className="max-w-xs truncate px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {member.bio}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditing(member)}
                          className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          disabled={deleting === member.id}
                          className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          {deleting === member.id ? "..." : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

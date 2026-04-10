import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";

interface Speaker {
  id: string;
  name: string;
  bio: string;
  photo_url: string;
  company: string;
  role: string;
  topics: string[];
  social_links: Record<string, string>;
  talk_ids: string[];
}

const EMPTY_SPEAKER: Speaker = {
  id: "",
  name: "",
  bio: "",
  photo_url: "",
  company: "",
  role: "",
  topics: [],
  social_links: {},
  talk_ids: [],
};

export function SpeakerList() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState("");

  const form = editing || (creating ? EMPTY_SPEAKER : null);

  useEffect(() => {
    loadSpeakers();
  }, []);

  async function loadSpeakers() {
    setLoading(true);
    const res = await api.listSpeakers();
    if (res.success && res.data) {
      setSpeakers(res.data as Speaker[]);
    } else {
      setError(res.error || "Error al cargar speakers");
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const isNew = creating;
    const res = isNew
      ? await api.addSpeaker(form)
      : await api.updateSpeaker(form.id, form);

    if (res.success) {
      setToast({
        message: `Speaker ${isNew ? "agregado" : "actualizado"}`,
        type: "success",
      });
      setEditing(null);
      setCreating(false);
      loadSpeakers();
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(`Eliminar speaker "${id}"?`)) return;
    setDeleting(id);
    const res = await api.deleteSpeaker(id);
    if (res.success) {
      setSpeakers((prev) => prev.filter((s) => s.id !== id));
      setToast({ message: "Speaker eliminado", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setDeleting(null);
  }

  function updateForm(field: keyof Speaker, value: unknown) {
    if (editing) setEditing({ ...editing, [field]: value });
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

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  if (form) {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => {
            setEditing(null);
            setCreating(false);
          }}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Volver a speakers
        </button>
        <h2 className="mb-6 text-xl font-bold text-gray-900">
          {creating ? "Agregar speaker" : `Editar: ${form.name}`}
        </h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="ID (slug)" required>
                <input
                  type="text"
                  value={form.id}
                  onChange={(e) => updateForm("id", e.target.value)}
                  placeholder="juan-perez"
                  className={inputClass}
                  disabled={!!editing}
                />
              </FormField>
              <FormField label="Nombre" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Empresa">
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => updateForm("company", e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Rol">
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => updateForm("role", e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Bio">
                  <textarea
                    value={form.bio}
                    onChange={(e) => updateForm("bio", e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="URL foto">
                  <input
                    type="url"
                    value={form.photo_url}
                    onChange={(e) => updateForm("photo_url", e.target.value)}
                    className={inputClass}
                  />
                </FormField>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Topics</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (topicInput.trim()) {
                      updateForm("topics", [...form.topics, topicInput.trim()]);
                      setTopicInput("");
                    }
                  }
                }}
                placeholder="Agregar topic"
                className={inputClass}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.topics.map((topic, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                >
                  {topic}
                  <button
                    type="button"
                    onClick={() =>
                      updateForm(
                        "topics",
                        form.topics.filter((_, idx) => idx !== i)
                      )
                    }
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Redes sociales</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {["linkedin", "github", "twitter", "web"].map((key) => (
                <FormField key={key} label={key}>
                  <input
                    type="url"
                    value={form.social_links[key] || ""}
                    onChange={(e) =>
                      updateForm("social_links", {
                        ...form.social_links,
                        [key]: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </FormField>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : creating ? "Agregar" : "Actualizar"}
            </button>
          </div>
        </form>
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

      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">{speakers.length} speakers</p>
        <button
          onClick={() => {
            setCreating(true);
            setEditing({ ...EMPTY_SPEAKER });
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Agregar speaker
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Speaker
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Empresa
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Topics
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {speakers.map((speaker) => (
              <tr key={speaker.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={speaker.photo_url || "/placeholder.svg"}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium text-gray-900">
                        {speaker.name}
                      </p>
                      <p className="text-xs text-gray-500">{speaker.role}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {speaker.company}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {speaker.topics.slice(0, 3).map((t, i) => (
                      <span
                        key={i}
                        className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                      >
                        {t}
                      </span>
                    ))}
                    {speaker.topics.length > 3 && (
                      <span className="text-xs text-gray-400">
                        +{speaker.topics.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(speaker)}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(speaker.id)}
                      disabled={deleting === speaker.id}
                      className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting === speaker.id ? "..." : "Eliminar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {speakers.length === 0 && (
          <p className="py-8 text-center text-gray-500">No hay speakers.</p>
        )}
      </div>
    </div>
  );
}

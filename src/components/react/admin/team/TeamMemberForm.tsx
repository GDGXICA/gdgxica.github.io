import { useState } from "react";
import { FormField } from "../ui/FormField";

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

interface Props {
  member?: TeamMember;
  onSave: (member: TeamMember, isNew: boolean) => Promise<void>;
  onCancel: () => void;
}

const EMPTY_MEMBER: TeamMember = {
  id: "",
  name: "",
  role: "",
  photo_url: "",
  bio: "",
  social_links: {},
  type: "member",
  tags: [],
};

export function TeamMemberForm({ member, onSave, onCancel }: Props) {
  const [form, setForm] = useState<TeamMember>(member || EMPTY_MEMBER);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const isNew = !member;

  function updateField(field: keyof TeamMember, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateSocialLink(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      social_links: { ...prev.social_links, [key]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={onCancel}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700"
      >
        ← Volver a equipo
      </button>

      <h2 className="mb-6 text-xl font-bold text-gray-900">
        {isNew ? "Agregar miembro" : `Editar: ${member?.name}`}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ID (slug)" required>
              <input
                type="text"
                value={form.id}
                onChange={(e) => updateField("id", e.target.value)}
                placeholder="juan-perez"
                className={inputClass}
                disabled={!isNew}
              />
            </FormField>
            <FormField label="Nombre" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Rol">
              <input
                type="text"
                value={form.role}
                onChange={(e) => updateField("role", e.target.value)}
                placeholder="Leadership, Technology, etc."
                className={inputClass}
              />
            </FormField>
            <FormField label="Tipo">
              <select
                value={form.type}
                onChange={(e) =>
                  updateField("type", e.target.value as "organizer" | "member")
                }
                className={inputClass}
              >
                <option value="organizer">Organizador</option>
                <option value="member">Miembro</option>
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Bio">
                <textarea
                  value={form.bio}
                  onChange={(e) => updateField("bio", e.target.value)}
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
                  onChange={(e) => updateField("photo_url", e.target.value)}
                  className={inputClass}
                />
              </FormField>
            </div>
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
                  onChange={(e) => updateSocialLink(key, e.target.value)}
                  className={inputClass}
                />
              </FormField>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Tags</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (tagInput.trim()) {
                    updateField("tags", [
                      ...(form.tags || []),
                      tagInput.trim(),
                    ]);
                    setTagInput("");
                  }
                }
              }}
              placeholder="Agregar tag y presionar Enter"
              className={inputClass}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(form.tags || []).map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    updateField(
                      "tags",
                      (form.tags || []).filter((_, idx) => idx !== i)
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

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : isNew ? "Agregar" : "Actualizar"}
          </button>
        </div>
      </form>
    </div>
  );
}

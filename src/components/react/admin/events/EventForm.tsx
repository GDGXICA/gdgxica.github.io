import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FormField } from "../ui/FormField";
import { Toast } from "../ui/Toast";

const CATEGORIES = ["devfest", "io", "studyjam", "wtm", "meetup"] as const;
const STATUSES = ["upcoming", "in-progress", "completed"] as const;

interface EventData {
  id: string;
  title: string;
  description: string;
  short_description: string;
  date: string;
  end_time: string;
  venue: string;
  venue_address: string;
  venue_map_url: string;
  image_url: string;
  topics: string[];
  speaker_ids: string[];
  speaker_names: string[];
  registration_url: string;
  is_virtual: boolean;
  is_highlight: boolean;
  participants: number;
  max_participants: number;
  category: string;
  status: string;
  requirements: string[];
  includes: string[];
  materials: Record<string, string>;
  agenda: { time: string; title: string; speaker: string }[];
}

const EMPTY_EVENT: EventData = {
  id: "",
  title: "",
  description: "",
  short_description: "",
  date: "",
  end_time: "",
  venue: "",
  venue_address: "",
  venue_map_url: "",
  image_url: "",
  topics: [],
  speaker_ids: [],
  speaker_names: [],
  registration_url: "",
  is_virtual: false,
  is_highlight: false,
  participants: 0,
  max_participants: 100,
  category: "meetup",
  status: "upcoming",
  requirements: [],
  includes: [],
  materials: {},
  agenda: [],
};

export function EventForm() {
  const editId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("edit") || undefined
      : undefined;
  const [form, setForm] = useState<EventData>(EMPTY_EVENT);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [topicInput, setTopicInput] = useState("");
  const [requirementInput, setRequirementInput] = useState("");
  const [includeInput, setIncludeInput] = useState("");

  const isEdit = !!editId;

  useEffect(() => {
    if (editId) {
      api.getEvent(editId).then((res) => {
        if (res.success && res.data) {
          setForm(res.data as EventData);
        }
        setLoading(false);
      });
    }
  }, [editId]);

  function updateField(field: keyof EventData, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addToList(
    field: "topics" | "requirements" | "includes",
    value: string
  ) {
    if (!value.trim()) return;
    setForm((prev) => ({
      ...prev,
      [field]: [...(prev[field] as string[]), value.trim()],
    }));
  }

  function removeFromList(
    field: "topics" | "requirements" | "includes",
    index: number
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.id || !form.title || !form.date) {
      setToast({
        message: "ID, titulo y fecha son obligatorios",
        type: "error",
      });
      return;
    }

    setSaving(true);
    const res = isEdit
      ? await api.updateEvent(editId!, form)
      : await api.createEvent(form);

    if (res.success) {
      setToast({
        message: `Evento ${isEdit ? "actualizado" : "creado"}. El sitio se reconstruira en ~2-3 min.`,
        type: "success",
      });
      if (!isEdit) {
        setTimeout(() => {
          window.location.href = "/admin/eventos";
        }, 2000);
      }
    } else {
      setToast({ message: res.error || "Error al guardar", type: "error" });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="mx-auto max-w-3xl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex items-center gap-4">
        <a
          href="/admin/eventos"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Volver a eventos
        </a>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">
            Informacion basica
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ID (slug)" required>
              <input
                type="text"
                value={form.id}
                onChange={(e) => updateField("id", e.target.value)}
                placeholder="devfest-2026"
                className={inputClass}
                disabled={isEdit}
              />
            </FormField>
            <FormField label="Titulo" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="DevFest 2026"
                className={inputClass}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Descripcion corta">
                <input
                  type="text"
                  value={form.short_description}
                  onChange={(e) =>
                    updateField("short_description", e.target.value)
                  }
                  className={inputClass}
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Descripcion completa">
                <textarea
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={4}
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Fecha y lugar</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Fecha y hora" required>
              <input
                type="datetime-local"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Hora fin">
              <input
                type="text"
                value={form.end_time}
                onChange={(e) => updateField("end_time", e.target.value)}
                placeholder="02:00 PM"
                className={inputClass}
              />
            </FormField>
            <FormField label="Sede">
              <input
                type="text"
                value={form.venue}
                onChange={(e) => updateField("venue", e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Direccion">
              <input
                type="text"
                value={form.venue_address}
                onChange={(e) => updateField("venue_address", e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Google Maps URL">
              <input
                type="url"
                value={form.venue_map_url}
                onChange={(e) => updateField("venue_map_url", e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="URL imagen">
              <input
                type="url"
                value={form.image_url}
                onChange={(e) => updateField("image_url", e.target.value)}
                className={inputClass}
              />
            </FormField>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_virtual}
                  onChange={(e) => updateField("is_virtual", e.target.checked)}
                  className="rounded"
                />
                Virtual
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_highlight}
                  onChange={(e) =>
                    updateField("is_highlight", e.target.checked)
                  }
                  className="rounded"
                />
                Destacado
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Detalles</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Categoria">
              <select
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Estado">
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className={inputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Participantes actuales">
              <input
                type="number"
                value={form.participants}
                onChange={(e) =>
                  updateField("participants", parseInt(e.target.value) || 0)
                }
                className={inputClass}
              />
            </FormField>
            <FormField label="Capacidad maxima">
              <input
                type="number"
                value={form.max_participants}
                onChange={(e) =>
                  updateField("max_participants", parseInt(e.target.value) || 0)
                }
                className={inputClass}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Link de registro">
                <input
                  type="url"
                  value={form.registration_url}
                  onChange={(e) =>
                    updateField("registration_url", e.target.value)
                  }
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
                  addToList("topics", topicInput);
                  setTopicInput("");
                }
              }}
              placeholder="Agregar topic y presionar Enter"
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
                  onClick={() => removeFromList("topics", i)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Requisitos</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={requirementInput}
              onChange={(e) => setRequirementInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToList("requirements", requirementInput);
                  setRequirementInput("");
                }
              }}
              placeholder="Agregar requisito y presionar Enter"
              className={inputClass}
            />
          </div>
          <ul className="mt-2 space-y-1">
            {form.requirements.map((req, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded bg-gray-50 px-3 py-1 text-sm"
              >
                {req}
                <button
                  type="button"
                  onClick={() => removeFromList("requirements", i)}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Incluye</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={includeInput}
              onChange={(e) => setIncludeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToList("includes", includeInput);
                  setIncludeInput("");
                }
              }}
              placeholder="Agregar item y presionar Enter"
              className={inputClass}
            />
          </div>
          <ul className="mt-2 space-y-1">
            {form.includes.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded bg-gray-50 px-3 py-1 text-sm"
              >
                {item}
                <button
                  type="button"
                  onClick={() => removeFromList("includes", i)}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-3">
          <a
            href="/admin/eventos"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </a>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : isEdit
                ? "Actualizar evento"
                : "Crear evento"}
          </button>
        </div>
      </form>
    </div>
  );
}

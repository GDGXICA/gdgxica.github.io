import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FormField } from "../ui/FormField";
import { Toast } from "../ui/Toast";
import { toImagePath } from "@/lib/image";

const CATEGORIES = ["devfest", "io", "studyjam", "wtm", "meetup"] as const;
const STATUSES = ["upcoming", "in-progress", "completed"] as const;
const SCHEDULE_TYPES = ["break", "event", "networking", "workshop"] as const;

interface AgendaItem {
  time: string;
  title: string;
  speaker: string;
  image: string;
  role: string;
  type: string;
}

interface TrackDef {
  id: string;
  name: string;
  color: string;
  description: string;
}

interface TrackSession {
  id: number;
  title: string;
  name: string;
  image: string;
  role: string;
  type: string;
  startTime: string;
  endTime: string;
  duration: string;
  isKeynote?: boolean;
}

interface SponsorItem {
  id: string;
  image_url: string;
  alt: string;
}

interface Speaker {
  id: string;
  name: string;
  photo_url: string;
  role: string;
}

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
  venue_map_embed: string;
  image_url: string;
  topics: string[];
  technologies: string[];
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
  sponsors: SponsorItem[];
  agenda: AgendaItem[];
  tracks: TrackDef[];
  track_sessions: Record<string, TrackSession[]>;
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
  venue_map_embed: "",
  image_url: "",
  topics: [],
  technologies: [],
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
  sponsors: [],
  agenda: [],
  tracks: [],
  track_sessions: {},
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

  // Dynamic inputs
  const [topicInput, setTopicInput] = useState("");
  const [techInput, setTechInput] = useState("");
  const [requirementInput, setRequirementInput] = useState("");
  const [includeInput, setIncludeInput] = useState("");
  const [speakerSearch, setSpeakerSearch] = useState("");
  const [availableSpeakers, setAvailableSpeakers] = useState<Speaker[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"simple" | "multitrack">(
    "simple"
  );

  const isEdit = !!editId;

  useEffect(() => {
    api.listSpeakers().then((res) => {
      if (res.success && res.data) {
        setAvailableSpeakers(res.data as Speaker[]);
      }
    });
  }, []);

  useEffect(() => {
    if (editId) {
      api.getEvent(editId).then((res) => {
        if (res.success && res.data) {
          const data = res.data as EventData;
          setForm({
            ...EMPTY_EVENT,
            ...data,
            sponsors: data.sponsors || [],
            agenda: data.agenda || [],
            tracks: data.tracks || [],
            track_sessions: data.track_sessions || {},
            technologies: data.technologies || [],
          });
          if (
            data.track_sessions &&
            Object.keys(data.track_sessions).length > 0
          ) {
            setScheduleMode("multitrack");
          }
        }
        setLoading(false);
      });
    }
  }, [editId]);

  function updateField(field: keyof EventData, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addToList(
    field: "topics" | "requirements" | "includes" | "technologies",
    value: string
  ) {
    if (!value.trim()) return;
    setForm((prev) => ({
      ...prev,
      [field]: [...(prev[field] as string[]), value.trim()],
    }));
  }

  function removeFromList(
    field: "topics" | "requirements" | "includes" | "technologies",
    index: number
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).filter((_, i) => i !== index),
    }));
  }

  // Speaker selection
  function toggleSpeaker(speaker: Speaker) {
    const isSelected = form.speaker_ids.includes(speaker.id);
    if (isSelected) {
      setForm((prev) => ({
        ...prev,
        speaker_ids: prev.speaker_ids.filter((id) => id !== speaker.id),
        speaker_names: prev.speaker_names.filter((n) => n !== speaker.name),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        speaker_ids: [...prev.speaker_ids, speaker.id],
        speaker_names: [...prev.speaker_names, speaker.name],
      }));
    }
  }

  const filteredSpeakers = availableSpeakers.filter(
    (s) =>
      !speakerSearch ||
      s.name.toLowerCase().includes(speakerSearch.toLowerCase())
  );

  // Sponsors
  function addSponsor() {
    setForm((prev) => ({
      ...prev,
      sponsors: [
        ...prev.sponsors,
        { id: String(prev.sponsors.length + 1), image_url: "", alt: "" },
      ],
    }));
  }

  function updateSponsor(
    index: number,
    field: keyof SponsorItem,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      sponsors: prev.sponsors.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }));
  }

  function removeSponsor(index: number) {
    setForm((prev) => ({
      ...prev,
      sponsors: prev.sponsors.filter((_, i) => i !== index),
    }));
  }

  // Agenda simple
  function addAgendaItem() {
    setForm((prev) => ({
      ...prev,
      agenda: [
        ...prev.agenda,
        {
          time: "",
          title: "",
          speaker: "",
          image: "",
          role: "",
          type: "event",
        },
      ],
    }));
  }

  function updateAgendaItem(
    index: number,
    field: keyof AgendaItem,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      agenda: prev.agenda.map((a, i) =>
        i === index ? { ...a, [field]: value } : a
      ),
    }));
  }

  function removeAgendaItem(index: number) {
    setForm((prev) => ({
      ...prev,
      agenda: prev.agenda.filter((_, i) => i !== index),
    }));
  }

  // Tracks
  function addTrack() {
    const id = `track-${form.tracks.length + 1}`;
    setForm((prev) => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        { id, name: "", color: "#1976D2", description: "" },
      ],
      track_sessions: { ...prev.track_sessions, [id]: [] },
    }));
  }

  function updateTrack(index: number, field: keyof TrackDef, value: string) {
    setForm((prev) => {
      const oldId = prev.tracks[index].id;
      const newTracks = prev.tracks.map((t, i) =>
        i === index ? { ...t, [field]: value } : t
      );
      const newSessions = { ...prev.track_sessions };
      if (field === "id" && oldId !== value) {
        newSessions[value] = newSessions[oldId] || [];
        delete newSessions[oldId];
      }
      return { ...prev, tracks: newTracks, track_sessions: newSessions };
    });
  }

  function removeTrack(index: number) {
    setForm((prev) => {
      const trackId = prev.tracks[index].id;
      const newSessions = { ...prev.track_sessions };
      delete newSessions[trackId];
      return {
        ...prev,
        tracks: prev.tracks.filter((_, i) => i !== index),
        track_sessions: newSessions,
      };
    });
  }

  // Track sessions
  function addTrackSession(trackId: string) {
    setForm((prev) => ({
      ...prev,
      track_sessions: {
        ...prev.track_sessions,
        [trackId]: [
          ...(prev.track_sessions[trackId] || []),
          {
            id: (prev.track_sessions[trackId]?.length || 0) + 1,
            title: "",
            name: "",
            image: "",
            role: "",
            type: "event",
            startTime: "",
            endTime: "",
            duration: "",
          },
        ],
      },
    }));
  }

  function updateTrackSession(
    trackId: string,
    index: number,
    field: keyof TrackSession,
    value: string | boolean | number
  ) {
    setForm((prev) => ({
      ...prev,
      track_sessions: {
        ...prev.track_sessions,
        [trackId]: (prev.track_sessions[trackId] || []).map((s, i) =>
          i === index ? { ...s, [field]: value } : s
        ),
      },
    }));
  }

  function removeTrackSession(trackId: string, index: number) {
    setForm((prev) => ({
      ...prev,
      track_sessions: {
        ...prev.track_sessions,
        [trackId]: (prev.track_sessions[trackId] || []).filter(
          (_, i) => i !== index
        ),
      },
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

    // Build the event payload
    const payload = { ...form };

    // If multitrack, clear simple agenda
    if (scheduleMode === "multitrack") {
      payload.agenda = [];
    } else {
      payload.tracks = [];
      payload.track_sessions = {};
    }

    setSaving(true);
    const res = isEdit
      ? await api.updateEvent(editId!, payload)
      : await api.createEvent(payload);

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
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400";

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
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          ← Volver a eventos
        </a>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informacion basica */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
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

        {/* Fecha y lugar */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Fecha y lugar
          </h3>
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
            <FormField label="Google Maps Embed URL">
              <input
                type="url"
                value={form.venue_map_embed}
                onChange={(e) => updateField("venue_map_embed", e.target.value)}
                placeholder="https://www.google.com/maps/embed?pb=..."
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
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_virtual}
                  onChange={(e) => updateField("is_virtual", e.target.checked)}
                  className="rounded"
                />
                Virtual
              </label>
              <label className="flex items-center gap-2 text-sm dark:text-gray-300">
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

        {/* Detalles */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Detalles
          </h3>
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

        {/* Speakers */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Speakers ({form.speaker_ids.length})
          </h3>
          <input
            type="text"
            value={speakerSearch}
            onChange={(e) => setSpeakerSearch(e.target.value)}
            placeholder="Buscar speaker..."
            className={inputClass}
          />
          {form.speaker_ids.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {form.speaker_ids.map((id) => {
                const speaker = availableSpeakers.find((s) => s.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-100 py-1 pr-3 pl-1 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    <img
                      src={toImagePath(speaker?.photo_url)}
                      alt=""
                      className="h-6 w-6 rounded-full bg-gray-200 object-cover"
                    />
                    {speaker?.name || id}
                    <button
                      type="button"
                      onClick={() =>
                        toggleSpeaker(
                          speaker || { id, name: id, photo_url: "", role: "" }
                        )
                      }
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600">
            {filteredSpeakers.map((speaker) => (
              <button
                key={speaker.id}
                type="button"
                onClick={() => toggleSpeaker(speaker)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  form.speaker_ids.includes(speaker.id)
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                    : "hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <img
                  src={toImagePath(speaker.photo_url)}
                  alt=""
                  className="h-6 w-6 rounded-full bg-gray-200 object-cover"
                />
                <span>{speaker.name}</span>
                <span className="text-xs text-gray-400">{speaker.role}</span>
                {form.speaker_ids.includes(speaker.id) && (
                  <span className="ml-auto text-blue-600">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Sponsors */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Sponsors ({form.sponsors.length})
            </h3>
            <button
              type="button"
              onClick={addSponsor}
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              + Agregar
            </button>
          </div>
          {form.sponsors.map((sponsor, i) => (
            <div key={i} className="mb-3 flex items-center gap-2">
              <input
                type="text"
                value={sponsor.alt}
                onChange={(e) => updateSponsor(i, "alt", e.target.value)}
                placeholder="Nombre"
                className={`${inputClass} w-1/3`}
              />
              <input
                type="url"
                value={sponsor.image_url}
                onChange={(e) => updateSponsor(i, "image_url", e.target.value)}
                placeholder="URL del logo"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeSponsor(i)}
                className="text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Topics + Technologies */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Topics
            </h3>
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
              placeholder="Agregar topic"
              className={inputClass}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {form.topics.map((t, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeFromList("topics", i)}
                    className="text-blue-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Tecnologias
            </h3>
            <input
              type="text"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToList("technologies", techInput);
                  setTechInput("");
                }
              }}
              placeholder="Agregar tecnologia"
              className={inputClass}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {form.technologies.map((t, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeFromList("technologies", i)}
                    className="text-green-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Requisitos + Incluye */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Requisitos
            </h3>
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
              placeholder="Agregar requisito"
              className={inputClass}
            />
            <ul className="mt-2 space-y-1">
              {form.requirements.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded bg-gray-50 px-3 py-1 text-sm dark:bg-gray-700 dark:text-gray-300"
                >
                  {r}
                  <button
                    type="button"
                    onClick={() => removeFromList("requirements", i)}
                    className="text-red-500"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Incluye
            </h3>
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
              placeholder="Agregar item"
              className={inputClass}
            />
            <ul className="mt-2 space-y-1">
              {form.includes.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded bg-gray-50 px-3 py-1 text-sm dark:bg-gray-700 dark:text-gray-300"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeFromList("includes", i)}
                    className="text-red-500"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Schedule */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Agenda
            </h3>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600">
              <button
                type="button"
                onClick={() => setScheduleMode("simple")}
                className={`rounded-l-lg px-3 py-1.5 text-xs ${scheduleMode === "simple" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400"}`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("multitrack")}
                className={`rounded-r-lg px-3 py-1.5 text-xs ${scheduleMode === "multitrack" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400"}`}
              >
                Multi-track
              </button>
            </div>
          </div>

          {scheduleMode === "simple" && (
            <div>
              {form.agenda.map((item, i) => (
                <div
                  key={i}
                  className="mb-3 rounded-lg border border-gray-100 p-3 dark:border-gray-600"
                >
                  <div className="mb-2 grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={item.time}
                      onChange={(e) =>
                        updateAgendaItem(i, "time", e.target.value)
                      }
                      placeholder="09:00 AM - 10:00 AM"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        updateAgendaItem(i, "title", e.target.value)
                      }
                      placeholder="Titulo"
                      className={`${inputClass} sm:col-span-2`}
                    />
                  </div>
                  <div className="mb-2 grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={item.speaker}
                      onChange={(e) =>
                        updateAgendaItem(i, "speaker", e.target.value)
                      }
                      placeholder="Speaker"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={item.role}
                      onChange={(e) =>
                        updateAgendaItem(i, "role", e.target.value)
                      }
                      placeholder="Rol"
                      className={inputClass}
                    />
                    <select
                      value={item.type}
                      onChange={(e) =>
                        updateAgendaItem(i, "type", e.target.value)
                      }
                      className={inputClass}
                    >
                      {SCHEDULE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.image}
                      onChange={(e) =>
                        updateAgendaItem(i, "image", e.target.value)
                      }
                      placeholder="URL imagen speaker"
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => removeAgendaItem(i)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addAgendaItem}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                + Agregar item a la agenda
              </button>
            </div>
          )}

          {scheduleMode === "multitrack" && (
            <div>
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tracks
                </h4>
                {form.tracks.map((track, i) => (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={track.id}
                      onChange={(e) => updateTrack(i, "id", e.target.value)}
                      placeholder="ID"
                      className={`${inputClass} w-24`}
                    />
                    <input
                      type="text"
                      value={track.name}
                      onChange={(e) => updateTrack(i, "name", e.target.value)}
                      placeholder="Nombre del salon"
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="color"
                      value={track.color}
                      onChange={(e) => updateTrack(i, "color", e.target.value)}
                      className="h-9 w-9 cursor-pointer rounded border-0"
                    />
                    <button
                      type="button"
                      onClick={() => removeTrack(i)}
                      className="text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTrack}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  + Agregar track
                </button>
              </div>

              {form.tracks.map((track) => (
                <div
                  key={track.id}
                  className="mb-4 rounded-lg border-l-4 p-4"
                  style={{ borderColor: track.color }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {track.name || track.id}
                    </h4>
                    <button
                      type="button"
                      onClick={() => addTrackSession(track.id)}
                      className="text-xs text-blue-600 dark:text-blue-400"
                    >
                      + Session
                    </button>
                  </div>
                  {(form.track_sessions[track.id] || []).map((session, si) => (
                    <div
                      key={si}
                      className="mb-2 rounded border border-gray-100 p-2 dark:border-gray-600"
                    >
                      <div className="mb-1 grid gap-2 sm:grid-cols-4">
                        <input
                          type="text"
                          value={session.startTime}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "startTime",
                              e.target.value
                            )
                          }
                          placeholder="Inicio"
                          className={inputClass}
                        />
                        <input
                          type="text"
                          value={session.endTime}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "endTime",
                              e.target.value
                            )
                          }
                          placeholder="Fin"
                          className={inputClass}
                        />
                        <input
                          type="text"
                          value={session.duration}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "duration",
                              e.target.value
                            )
                          }
                          placeholder="Duracion"
                          className={inputClass}
                        />
                        <select
                          value={session.type}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "type",
                              e.target.value
                            )
                          }
                          className={inputClass}
                        >
                          {SCHEDULE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-1 grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={session.title}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "title",
                              e.target.value
                            )
                          }
                          placeholder="Titulo"
                          className={inputClass}
                        />
                        <input
                          type="text"
                          value={session.name}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "name",
                              e.target.value
                            )
                          }
                          placeholder="Speaker"
                          className={inputClass}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={session.role}
                          onChange={(e) =>
                            updateTrackSession(
                              track.id,
                              si,
                              "role",
                              e.target.value
                            )
                          }
                          placeholder="Rol"
                          className={`${inputClass} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeTrackSession(track.id, si)}
                          className="text-xs text-red-500"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <a
            href="/admin/eventos"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
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

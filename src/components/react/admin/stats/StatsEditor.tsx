import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FormField } from "../ui/FormField";
import { Toast } from "../ui/Toast";

interface Stats {
  total_members: number;
  total_events: number;
  total_talks: number;
  total_speakers: number;
  years_active: number;
  total_organizers: number;
  developers_mentored: number;
  total_sponsors: number;
  annual_support: string;
  sponsored_events: number;
  developers_reached: number;
  active_volunteers: number;
  volunteer_hours: number;
  events_supported: number;
  volunteer_areas: number;
  updated_at: string;
}

const FIELDS: { key: keyof Stats; label: string; type: "number" | "text" }[] = [
  { key: "total_members", label: "Total miembros", type: "number" },
  { key: "total_events", label: "Total eventos", type: "number" },
  { key: "total_talks", label: "Total charlas", type: "number" },
  { key: "total_speakers", label: "Total speakers", type: "number" },
  { key: "years_active", label: "Anos activos", type: "number" },
  { key: "total_organizers", label: "Total organizadores", type: "number" },
  { key: "developers_mentored", label: "Devs mentoreados", type: "number" },
  { key: "total_sponsors", label: "Total sponsors", type: "number" },
  { key: "annual_support", label: "Apoyo anual", type: "text" },
  { key: "sponsored_events", label: "Eventos patrocinados", type: "number" },
  { key: "developers_reached", label: "Devs alcanzados", type: "number" },
  { key: "active_volunteers", label: "Voluntarios activos", type: "number" },
  { key: "volunteer_hours", label: "Horas voluntariado", type: "number" },
  { key: "events_supported", label: "Eventos apoyados", type: "number" },
  { key: "volunteer_areas", label: "Areas de apoyo", type: "number" },
];

export function StatsEditor() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    api.getStats().then((res) => {
      if (res.success && res.data) {
        setStats(res.data as Stats);
      }
      setLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!stats) return;
    setSaving(true);
    const res = await api.updateStats(stats);
    if (res.success) {
      setToast({
        message: "Stats actualizados. El sitio se reconstruira en ~2-3 min.",
        type: "success",
      });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setSaving(false);
  }

  if (loading || !stats) {
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

      <p className="mb-6 text-sm text-gray-500">
        Estos valores se muestran en las paginas publicas del sitio. Ultima
        actualizacion: {new Date(stats.updated_at).toLocaleDateString("es-PE")}
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {FIELDS.map(({ key, label, type }) => (
              <FormField key={key} label={label}>
                <input
                  type={type}
                  value={stats[key]}
                  onChange={(e) =>
                    setStats({
                      ...stats,
                      [key]:
                        type === "number"
                          ? parseInt(e.target.value) || 0
                          : e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </FormField>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Actualizar stats"}
          </button>
        </div>
      </form>
    </div>
  );
}

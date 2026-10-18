import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FormField } from "../ui/FormField";
import { Toast } from "../ui/Toast";
import {
  CornerNodes,
  ErrorState,
  LoadingState,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { changedFields, GROUPS, type Stats } from "./fields";

function formatValue(value: string | number) {
  if (typeof value === "number") return value.toLocaleString("es-PE");
  return value.trim() || "vacío";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function StatsEditor() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [saved, setSaved] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError(false);
    const res = await api.getStats();
    if (res.success && res.data) {
      setStats(res.data as Stats);
      setSaved(res.data as Stats);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!stats) return;
    setSaving(true);
    setSaveError(false);
    const res = await api.updateStats(stats);
    if (res.success) {
      const updatedAt =
        (res.data as Partial<Stats> | undefined)?.updated_at ??
        stats.updated_at;
      const next = { ...stats, updated_at: updatedAt };
      setStats(next);
      setSaved(next);
      setToast({
        message: "Cifras guardadas. El sitio se reconstruye en 2 o 3 minutos.",
        type: "success",
      });
    } else {
      setSaveError(true);
    }
    setSaving(false);
  }

  if (loading) {
    return <LoadingState label="Cargando las cifras del sitio…" />;
  }

  if (error || !stats || !saved) {
    return (
      <ErrorState
        message="No se pudieron cargar las cifras. Suele ser la conexión con el repositorio de datos."
        onRetry={loadStats}
      />
    );
  }

  const changes = changedFields(saved, stats);
  const updatedAt = formatUpdatedAt(saved.updated_at);

  return (
    <div className="mx-auto max-w-6xl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <p className="text-atlas-mist mb-10 max-w-2xl text-sm">
        Las cifras de la comunidad que muestra el sitio público. Casi todas
        aparecen con «+» detrás, así que basta con el número redondo.
      </p>

      <form
        onSubmit={handleSave}
        className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      >
        <div className="space-y-10">
          {GROUPS.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`cifras-${group.id}`}
              className="@container"
            >
              <SectionHeading>
                <span id={`cifras-${group.id}`}>{group.title}</span>
              </SectionHeading>
              <p className="text-atlas-fog mb-4 text-sm">{group.where}</p>
              <div className="grid grid-cols-2 items-end gap-x-3 gap-y-4 @xl:gap-x-4 @3xl:grid-cols-4">
                {group.fields.map(({ key, label, type, placeholder }) => (
                  <FormField key={key} label={label}>
                    <input
                      type={type}
                      inputMode={type === "number" ? "numeric" : undefined}
                      min={type === "number" ? 0 : undefined}
                      step={type === "number" ? 1 : undefined}
                      value={stats[key]}
                      placeholder={placeholder}
                      onChange={(e) =>
                        setStats({
                          ...stats,
                          [key]:
                            type === "number"
                              ? parseInt(e.target.value) || 0
                              : e.target.value,
                        })
                      }
                      className={`${inputClass} tabular-nums`}
                    />
                  </FormField>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside
          aria-label="Cambios sin guardar"
          className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
        >
          <CornerNodes />
          <p className="atlas-label text-atlas-glow">Cambios sin guardar</p>
          {changes.length === 0 ? (
            <p className="text-atlas-mist mt-3 text-sm">
              Ninguno todavía. Edita una cifra para poder guardar.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {changes.map((field) => (
                <li key={field.key} className="flex justify-between gap-4">
                  <span className="text-atlas-fog">{field.label}</span>
                  <span className="text-atlas-dust text-right tabular-nums">
                    <span className="sr-only">antes </span>
                    <span className="text-atlas-fog line-through">
                      {formatValue(saved[field.key])}
                    </span>
                    <span className="sr-only">, ahora</span>{" "}
                    {formatValue(stats[field.key])}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="border-atlas-line text-atlas-fog mt-4 border-t pt-3 text-sm">
            {updatedAt ? (
              <>
                Actualizadas el{" "}
                <span className="text-atlas-dust">{updatedAt}</span>
              </>
            ) : (
              "Sin fecha de actualización"
            )}
          </p>

          {saveError && (
            <p
              role="alert"
              className="border-atlas-rose/40 bg-atlas-rose/5 text-atlas-dust mt-4 rounded-md border px-3 py-2.5 text-sm"
            >
              No se pudieron guardar las cifras. Revisa que sean números enteros
              entre 0 y 10 000 000 e inténtalo de nuevo.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || changes.length === 0}
            className={`${buttonClass.primary} mt-5 w-full`}
          >
            {saving
              ? "Guardando…"
              : changes.length === 1
                ? "Guardar 1 cambio"
                : changes.length > 1
                  ? `Guardar ${changes.length} cambios`
                  : "Guardar cifras"}
          </button>
          {changes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setStats(saved);
                setSaveError(false);
              }}
              className={`${buttonClass.secondary} mt-2 w-full`}
            >
              Descartar cambios
            </button>
          )}
          <p className="text-atlas-fog mt-3 text-xs leading-snug">
            Se publican en el repositorio de datos y el sitio se reconstruye
            solo; tarda 2 o 3 minutos en verse.
          </p>
        </aside>
      </form>
    </div>
  );
}

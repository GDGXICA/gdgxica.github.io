import { useEffect, useState } from "react";
import type { MuralSettings, MuralState } from "@/lib/mural";

interface Props {
  settings: MuralSettings;
  saving: boolean;
  onSave: (settings: {
    state: MuralState;
    maxPerUid: number;
    maxTotal: number;
    headline: string;
  }) => void;
}

const STATE_LABELS: Record<MuralState, string> = {
  open: "Abierto — la gente puede subir",
  paused: "En pausa — el mural se ve, no se sube",
  closed: "Cerrado — no se admiten subidas",
};

export function MuralSettingsPanel({ settings, saving, onSave }: Props) {
  const [state, setState] = useState<MuralState>(settings.state);
  const [maxPerUid, setMaxPerUid] = useState(settings.maxPerUid);
  const [maxTotal, setMaxTotal] = useState(settings.maxTotal);
  const [headline, setHeadline] = useState(settings.headline);

  useEffect(() => {
    setState(settings.state);
    setMaxPerUid(settings.maxPerUid);
    setMaxTotal(settings.maxTotal);
    setHeadline(settings.headline);
  }, [
    settings.state,
    settings.maxPerUid,
    settings.maxTotal,
    settings.headline,
  ]);

  const used = settings.acceptedTotal;
  const pct = settings.maxTotal > 0 ? (used / settings.maxTotal) * 100 : 0;
  const full = used >= settings.maxTotal;

  const inRange = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;
  const invalid = !inRange(maxPerUid, 1, 50) || !inRange(maxTotal, 1, 5000);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">
        Ajustes del mural
      </h3>

      <label
        htmlFor="mural-state"
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Estado
      </label>
      <select
        id="mural-state"
        value={state}
        onChange={(e) => setState(e.target.value as MuralState)}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        {(Object.keys(STATE_LABELS) as MuralState[]).map((value) => (
          <option key={value} value={value}>
            {STATE_LABELS[value]}
          </option>
        ))}
      </select>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="mural-max-per-uid"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Fotos por persona
          </label>
          <input
            id="mural-max-per-uid"
            type="number"
            min={1}
            max={50}
            value={maxPerUid}
            onChange={(e) => setMaxPerUid(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label
            htmlFor="mural-max-total"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Total del evento
          </label>
          <input
            id="mural-max-total"
            type="number"
            min={1}
            max={5000}
            value={maxTotal}
            onChange={(e) => setMaxTotal(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>

      <label
        htmlFor="mural-headline"
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Titular de la pantalla
      </label>
      <input
        id="mural-headline"
        type="text"
        maxLength={120}
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="Sube tus fotos del DevFest"
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />

      <div className="mb-4">
        <p className="mb-1 flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Fotos aceptadas</span>
          <span className={full ? "font-semibold text-red-600" : ""}>
            {used} / {settings.maxTotal}
          </span>
        </p>
        <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full ${full ? "bg-red-600" : "bg-blue-600"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        {full && (
          <p className="mt-1 text-xs text-red-600">
            El mural está lleno. Sube el total si quieres seguir aceptando
            fotos.
          </p>
        )}
      </div>

      {invalid && (
        <p className="mb-2 text-xs text-red-600">
          Las fotos por persona van de 1 a 50, y el total del evento de 1 a
          5000.
        </p>
      )}

      <button
        type="button"
        disabled={saving || invalid}
        onClick={() => onSave({ state, maxPerUid, maxTotal, headline })}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar ajustes"}
      </button>
    </div>
  );
}

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { parseBevyCsv, type BevyRegistration } from "./parseBevyCsv";

interface Props {
  slug: string;
  onImported: (summary: string) => void;
}

/**
 * Uploads the Bevy registrations CSV. Parsing happens here in the
 * browser; the handler only ever receives validated rows.
 *
 * Re-importing is the normal case — people register right up to the
 * doors opening — and it never clobbers check-ins already recorded.
 */
export function RosterImporter({ slug, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BevyRegistration[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const text = await file.text();
    const result = parseBevyCsv(text);
    setWarnings(result.warnings);
    setRows(result.rows.length > 0 ? result.rows : null);
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);
    setError(null);
    const res = await api.importCheckinRoster(slug, rows);
    setImporting(false);
    if (res.success && res.data) {
      const { created, updated, stale } = res.data;
      onImported(
        `${created} nuevos, ${updated} actualizados` +
          (stale > 0 ? `, ${stale} ya no figuran en el CSV` : "")
      );
      setRows(null);
      if (fileRef.current) fileRef.current.value = "";
    } else {
      setError(res.error || "No se pudo importar el roster.");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Importar registrados de Bevy
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        En Bevy: evento → Registrations → Download. Puedes reimportar todas
        las veces que quieras; los check-ins ya marcados se conservan.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFile}
        className="mt-4 block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700 dark:text-gray-400"
      />

      {warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {rows && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {rows.length} registrados listos para importar.
          </span>
          <button
            onClick={handleImport}
            disabled={importing}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? "Importando…" : "Importar"}
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { isDevPreview } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { Toast } from "../ui/Toast";
import { AttendeeRow } from "./AttendeeRow";
import { bevyCsvFilename, buildBevyCheckinCsv } from "./buildBevyCsv";
import { RosterImporter } from "./RosterImporter";
import { SyncStatusBar } from "./SyncStatusBar";
import { setCheckedIn, useRoster } from "./useRoster";
import type { Attendee } from "./types";

interface Props {
  // Injection point so tests need not touch window.location.
  initialSlug?: string;
}

/** Firestore paths are built from this, and a slug with a "/" would
 *  silently address the wrong collection depth. The API validates it
 *  server-side too (validateParamId), but the listener runs first. */
const SLUG_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("slug");
  return raw && SLUG_RE.test(raw) ? raw : null;
}

// Byte-for-byte mirror of tokenize() in functions/src/services/nameMatch.ts,
// which built the stored searchTokens. It cannot be imported: that module
// ships in the Cloud Function bundle, not the browser one. The two are held
// in sync by __tests__/search.test.ts, which imports BOTH and asserts they
// agree — without that, a divergence fails silently, telling the volunteer
// "no matches" for someone standing in front of them.
const PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "da",
  "dos",
  "van",
  "von",
]);

export function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s@.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits a query into the terms matched against searchTokens.
 *
 * Runs the identical algorithm the server ran over the stored values, which
 * is the only thing that makes matching reliable. Hand-aligning the two by
 * eye is what failed before: "Quintanilla-Garcia" was indexed as two tokens
 * but queried as one, and emails containing "+" or "_" were indexed verbatim
 * but split by the query.
 */
export function queryTerms(q: string): string[] {
  const out = new Set<string>();
  for (const piece of normalizeQuery(q).split(" ")) {
    const parts = piece.includes("@") ? [piece] : piece.split(".");
    for (const p of parts) {
      if (p.length > 1 && !PARTICLES.has(p)) out.add(p);
    }
  }
  return [...out];
}

export function CheckinPanel({ initialSlug }: Props) {
  const { user } = useAuth();
  const [slug] = useState<string | null>(initialSlug ?? slugFromUrl());
  const [query, setQuery] = useState("");
  const [showImporter, setShowImporter] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    attendees,
    meta,
    loading,
    error,
    offline,
    syncedOnce,
    metaError,
    pendingCount,
    // Hooks cannot be skipped, so the subscription is disabled by passing a
    // null slug — the early return for preview mode below happens after
    // this call and would not prevent the listener on its own.
  } = useRoster(isDevPreview ? null : slug);

  const hasRoster = attendees.length > 0;

  // Keyed on whether the input is actually mounted, not just on `loading`.
  // The input only exists once the roster has rows, so depending on
  // `loading` alone left it unfocused whenever the roster arrived after the
  // first snapshot — an import finishing, or the server replacing an empty
  // cached snapshot.
  useEffect(() => {
    searchRef.current?.focus();
  }, [loading, hasRoster]);

  const present = useMemo(
    () => attendees.filter((a) => a.checkedIn).length,
    [attendees]
  );

  const filtered = useMemo(() => {
    const terms = queryTerms(query);
    return attendees.filter((a) => {
      if (onlyPending && a.checkedIn) return false;
      if (terms.length === 0) return true;
      // Every term must prefix-match some token, so "qui gar" finds
      // "Quintanilla Garcia" without needing the full spelling.
      return terms.every((t) =>
        a.searchTokens.some((tok) => tok.startsWith(t))
      );
    });
  }, [attendees, query, onlyPending]);

  function handleExportBevyCsv() {
    if (!slug) return;
    const { csv, rows, alreadyInBevy } = buildBevyCheckinCsv(attendees);
    if (rows === 0) {
      setToast({
        message:
          alreadyInBevy > 0
            ? "Bevy ya tiene marcados a todos los presentes."
            : "Todavía no has marcado a nadie.",
        type: "success",
      });
      return;
    }

    // Blob + object URL rather than a data: URI — a few hundred rows of
    // names exceeds what some browsers accept in a URL.
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = bevyCsvFilename(slug, new Date());
    link.click();
    // Revoked on a later tick, not on the next line. Chromium starts the
    // download synchronously inside click(), but Firefox and Safari read
    // the blob afterwards — revoking immediately cancels the download
    // there, and the success toast below would still claim it worked.
    setTimeout(() => URL.revokeObjectURL(url), 0);

    setToast({
      message:
        `CSV con ${rows} check-in(s) para subir a Bevy` +
        (alreadyInBevy > 0
          ? `. Se omitieron ${alreadyInBevy} que Bevy ya tenía.`
          : "."),
      type: "success",
    });
  }

  function handleToggle(a: Attendee) {
    if (!slug || !user) return;
    // Fire-and-forget on purpose — see setCheckedIn's comment. Awaiting
    // would hang the button for as long as the venue wifi is down.
    void setCheckedIn(
      slug,
      a.id,
      !a.checkedIn,
      { uid: user.uid, name: user.displayName || user.email || user.uid },
      (message) => setToast({ message, type: "error" })
    );
  }

  // Every other admin panel reads through `api`, which isDevPreview swaps
  // for mockApi. This one talks to Firestore directly, so preview mode
  // would otherwise open a listener against the live appgdgica project
  // with no real credentials — a permission-denied panel that looks broken.
  if (isDevPreview) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Check-in
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Este panel lee Firestore en vivo, así que no funciona con datos de
          ejemplo.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
          Para probarlo, levanta los emuladores y arranca con{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
            PUBLIC_USE_FIREBASE_EMULATOR=true
          </code>
          .
        </p>
      </div>
    );
  }

  if (!slug) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <p className="font-medium">Falta indicar el evento.</p>
        <p className="mt-1 text-sm">
          Abre esta página como{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">
            /admin/checkin?slug=devfest-ica-2026
          </code>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SyncStatusBar
        present={present}
        total={attendees.length}
        offline={offline}
        pendingCount={pendingCount}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">{error}</p>
          <p className="mt-1">
            La lista dejó de actualizarse. Recarga la página para reconectar.
          </p>
        </div>
      )}

      {metaError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          No se pudo leer la información de la última importación, así que no se
          marcará a quienes ya no figuran en el CSV. El check-in funciona
          normal.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Check-in · {slug}
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportBevyCsv}
            disabled={present === 0}
            title="Descarga un CSV listo para el Bulk upload de Bevy"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Exportar para Bevy
          </button>
          <button
            onClick={() => setShowImporter((v) => !v)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {showImporter ? "Ocultar importador" : "Importar CSV"}
          </button>
        </div>
      </div>

      {showImporter && (
        <RosterImporter
          slug={slug}
          onImported={(summary) =>
            setToast({
              message: `Roster importado: ${summary}`,
              type: "success",
            })
          }
        />
      )}

      {error ? null : !hasRoster ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          {/* Suppressed while `error` is set: the listener error handler
              clears the roster, and without this guard a mid-event
              permission-denied would render "nobody is registered" plus a
              prominent Import button right below the error banner —
              inviting exactly the re-import this panel must never provoke. */}
          {syncedOnce ? (
            // Only claim the roster is empty once the SERVER has said so.
            // Asserting it from a cold cache told a volunteer at the door
            // that a fully populated event had nobody in it, and offered
            // them a re-import as the fix.
            <>
              <p className="text-gray-600 dark:text-gray-400">
                Todavía no hay nadie en el roster de este evento.
              </p>
              <button
                onClick={() => setShowImporter(true)}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Importar el CSV de Bevy
              </button>
            </>
          ) : (
            <>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">
                Conectando con el servidor…
              </p>
              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                Sin datos en caché todavía. Si no hay señal, espera a reconectar
                antes de importar nada.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, correo o número de ticket…"
              // Phones at the door: no autocorrect fighting surnames.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="rounded border-gray-300"
              />
              Ocultar a los que ya marqué
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-gray-500 dark:text-gray-400">
                {/* The filter is not always the query — with the checkbox on
                    and an empty box, the old message rendered a bare pair of
                    quotes at the exact moment everyone had been marked. */}
                {query.trim()
                  ? `Nadie coincide con “${query}”.`
                  : present === attendees.length
                    ? "Ya marcaste a todos los registrados. 🎉"
                    : "Nadie coincide con el filtro activo."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((a) => (
                  <AttendeeRow
                    key={a.id}
                    attendee={a}
                    stale={
                      !!meta?.lastImportId &&
                      a.lastImportId !== meta.lastImportId
                    }
                    onToggle={handleToggle}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Mostrando {filtered.length} de {attendees.length}
          </p>
        </>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

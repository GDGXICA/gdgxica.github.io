import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { Toast } from "../ui/Toast";
import { AttendeeRow } from "./AttendeeRow";
import { RosterImporter } from "./RosterImporter";
import { SyncStatusBar } from "./SyncStatusBar";
import { setCheckedIn, useRoster } from "./useRoster";
import type { Attendee } from "./types";

interface Props {
  // Injection point so tests need not touch window.location.
  initialSlug?: string;
}

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("slug");
}

/** Mirrors normalizeName() in functions/src/services/nameMatch.ts, which
 *  built the stored searchTokens — both sides must strip diacritics the
 *  same way or typing "nanez" would not find "Ñañez". */
function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s@._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  const { attendees, meta, loading, error, fromCache, pendingCount } =
    useRoster(slug);

  useEffect(() => {
    searchRef.current?.focus();
  }, [loading]);

  const present = useMemo(
    () => attendees.filter((a) => a.checkedIn).length,
    [attendees]
  );

  const filtered = useMemo(() => {
    const terms = normalizeQuery(query).split(" ").filter(Boolean);
    return attendees.filter((a) => {
      if (onlyPending && a.checkedIn) return false;
      if (terms.length === 0) return true;
      // Every term must prefix-match some token, so "qui gar" finds
      // "Quintanilla Garcia" without needing the full spelling.
      return terms.every((t) => a.searchTokens.some((tok) => tok.startsWith(t)));
    });
  }, [attendees, query, onlyPending]);

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
        fromCache={fromCache}
        pendingCount={pendingCount}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Check-in · {slug}
        </h1>
        <button
          onClick={() => setShowImporter((v) => !v)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {showImporter ? "Ocultar importador" : "Importar CSV"}
        </button>
      </div>

      {showImporter && (
        <RosterImporter
          slug={slug}
          onImported={(summary) =>
            setToast({ message: `Roster importado: ${summary}`, type: "success" })
          }
        />
      )}

      {attendees.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-400">
            Todavía no hay nadie en el roster de este evento.
          </p>
          <button
            onClick={() => setShowImporter(true)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Importar el CSV de Bevy
          </button>
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
                Nadie coincide con “{query}”.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((a) => (
                  <AttendeeRow
                    key={a.id}
                    attendee={a}
                    stale={
                      !!meta?.lastImportId && a.lastImportId !== meta.lastImportId
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

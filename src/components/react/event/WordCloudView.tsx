import { useMemo, useState } from "react";
import { getFirestore } from "@/lib/firebase";
import { isCleanWord, normalizeWord, WORD_MAX_LENGTH } from "@/lib/wordcloud";
import { useWordCloud } from "./useWordCloud";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  title: string;
  prompt: string;
  maxWordsPerUser: number;
}

const MIN_FONT_REM = 0.85;
const SCALE_PER_LOG = 0.6;

function localStorageKey(slug: string, instanceId: string): string {
  return `gdg_wordcloud_count_${slug}_${instanceId}`;
}

function readSentCount(slug: string, instanceId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = window.localStorage.getItem(localStorageKey(slug, instanceId));
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function writeSentCount(slug: string, instanceId: string, n: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localStorageKey(slug, instanceId), String(n));
  } catch {
    /* ignore */
  }
}

export function WordCloudView({
  slug,
  instanceId,
  title,
  prompt,
  maxWordsPerUser,
}: Props) {
  const { words, loading } = useWordCloud(slug, instanceId);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number>(() =>
    readSentCount(slug, instanceId)
  );

  const remaining = Math.max(0, maxWordsPerUser - sentCount);
  const trimmed = input.trim();

  const maxCount = useMemo(
    () => words.reduce((acc, w) => Math.max(acc, w.count), 1),
    [words]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (remaining <= 0) {
      setError(`Ya enviaste tus ${maxWordsPerUser} palabras para este juego.`);
      return;
    }
    const normalized = normalizeWord(trimmed);
    if (!normalized) {
      setError("Escribe al menos una palabra.");
      return;
    }
    if (!isCleanWord(trimmed)) {
      setError("Por favor, elige una palabra respetuosa.");
      return;
    }
    if (trimmed.length > WORD_MAX_LENGTH) {
      setError(`Máximo ${WORD_MAX_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const db = await getFirestore();
      const { doc, increment, serverTimestamp, setDoc } = await import(
        "firebase/firestore"
      );
      const ref = doc(
        db,
        `events/${slug}/minigames/${instanceId}/words/${normalized}`
      );
      await setDoc(
        ref,
        {
          text: trimmed,
          normalized,
          count: increment(1),
          lastSubmittedAt: serverTimestamp(),
          firstSubmittedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const next = sentCount + 1;
      setSentCount(next);
      writeSentCount(slug, instanceId, next);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-primary text-2xl font-semibold">{title}</h2>
        <p className="text-secondary mt-1 text-sm">{prompt}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-4 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={input}
          maxLength={WORD_MAX_LENGTH}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder="Tu palabra..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          disabled={remaining === 0}
        />
        <button
          type="submit"
          disabled={submitting || remaining === 0 || trimmed.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar"}
        </button>
      </form>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Te quedan <strong>{remaining}</strong> de {maxWordsPerUser} palabras.
      </p>
      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
        {loading && (
          <p className="text-center text-sm text-gray-500">Cargando nube...</p>
        )}
        {!loading && words.length === 0 && (
          <p className="text-center text-sm text-gray-500">
            Sé el primero en escribir una palabra.
          </p>
        )}
        {!loading && words.length > 0 && (
          <ul className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2">
            {words.map((w) => {
              const ratio = Math.log(w.count + 1) / Math.log(maxCount + 1);
              const fontSize = Math.max(
                MIN_FONT_REM,
                MIN_FONT_REM + ratio * SCALE_PER_LOG * 2
              );
              return (
                <li
                  key={w.id}
                  className="text-blue-700 dark:text-blue-300"
                  style={{ fontSize: `${fontSize}rem`, lineHeight: 1.2 }}
                >
                  {w.text}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

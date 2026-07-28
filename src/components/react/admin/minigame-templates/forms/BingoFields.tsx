import { useMemo, useState } from "react";
import { FormField } from "../../ui/FormField";
import { inputClass, type BingoConfig } from "../types";
import { GOOGLE_TECH_TERMS } from "./googleTechTerms";

interface Props {
  value: BingoConfig;
  onChange: (next: BingoConfig) => void;
}

// A bank this size or larger makes cards diverge enough that wins spread
// out on their own. Below it the dealer has to work harder to keep the
// bingos apart, and it says so.
const COMFORTABLE_BANK = 40;

function termsToText(terms: string[]): string {
  return terms.join("\n");
}

function textToTerms(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function BingoFields({ value, onChange }: Props) {
  // We keep a local raw textarea value so the admin can edit freely (including
  // empty lines while typing). The parsed term list is derived on change and
  // pushed up so validation stays consistent with the schema.
  const [raw, setRaw] = useState(termsToText(value.terms));

  const termCount = useMemo(() => textToTerms(raw).length, [raw]);

  function handleTextChange(next: string) {
    setRaw(next);
    onChange({ ...value, terms: textToTerms(next) });
  }

  function fillWithGoogleTerms() {
    const merged = Array.from(
      new Set([...textToTerms(raw), ...GOOGLE_TECH_TERMS])
    );
    setRaw(termsToText(merged));
    onChange({ ...value, terms: merged });
  }

  return (
    <div className="space-y-4">
      <FormField label="Términos del bingo" required>
        <textarea
          value={raw}
          onChange={(e) => handleTextChange(e.target.value)}
          rows={10}
          placeholder="Un término por línea..."
          className={`${inputClass} font-mono`}
        />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {termCount} términos detectados. Mínimo 16 (cada cartón es 4×4).
        </p>
        <button
          type="button"
          onClick={fillWithGoogleTerms}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          + Tecnologías de Google
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={value.classic}
            onChange={(e) => onChange({ ...value, classic: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span>
            <span className="font-medium text-gray-900 dark:text-white">
              Bingo clásico
            </span>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Tú cantas las bolas desde el panel y salen animadas en el
              proyector. Los asistentes solo pueden marcar lo que ya cantaste, y
              el ganador se verifica en el servidor.
            </span>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Sin marcar: modo conferencia — nadie canta, los que “cantan” son
              los speakers sin saberlo y cada uno marca cuando oye un término.
            </span>
          </span>
        </label>

        {value.classic && (
          <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 dark:border-gray-700">
            <FormField label="Premios disponibles">
              <input
                type="number"
                min={1}
                max={20}
                value={value.prizes}
                onChange={(e) =>
                  onChange({
                    ...value,
                    prizes: Number(e.target.value) || 1,
                  })
                }
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Los primeros {value.prizes} en completar línea salen marcados
                como premiados; el resto, como menciones.
              </p>
            </FormField>
            <FormField label="Ganadores por bola">
              <input
                type="number"
                min={1}
                max={10}
                value={value.maxWinnersPerDraw}
                onChange={(e) =>
                  onChange({
                    ...value,
                    maxWinnersPerDraw: Number(e.target.value) || 1,
                  })
                }
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Déjalo en 1 y los cartones se reparten para que nunca canten
                bingo dos personas en la misma bola.
              </p>
            </FormField>
          </div>
        )}

        {value.classic && termCount > 0 && termCount < COMFORTABLE_BANK && (
          <p className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            Con {termCount} términos los cartones se parecen mucho entre sí y la
            partida se acaba pronto. Sube a {COMFORTABLE_BANK}–50 para que haya
            tensión y los bingos se separen solos.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={value.freeCenter}
          onChange={(e) => onChange({ ...value, freeCenter: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
        Centro libre (no usado en cartones 4×4)
      </label>
    </div>
  );
}

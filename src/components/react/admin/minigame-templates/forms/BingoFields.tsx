import { useMemo, useState } from "react";
import { FormField } from "../../ui/FormField";
import { inputClass, type BingoConfig } from "../types";

interface Props {
  value: BingoConfig;
  onChange: (next: BingoConfig) => void;
}

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
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {termCount} términos detectados. Mínimo 16 (cada cartón es 4×4).
      </p>

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

import { FormField } from "../../ui/FormField";
import {
  inputClass,
  newOptionId,
  type OptionItem,
  type PollConfig,
} from "../types";

interface Props {
  value: PollConfig;
  onChange: (next: PollConfig) => void;
}

export function PollFields({ value, onChange }: Props) {
  function setQuestion(question: string) {
    onChange({ ...value, question });
  }

  function setOption(index: number, label: string) {
    const next = value.options.map((o, i) =>
      i === index ? { ...o, label } : o
    );
    onChange({ ...value, options: next });
  }

  function addOption() {
    if (value.options.length >= 6) return;
    const next: OptionItem[] = [
      ...value.options,
      { id: newOptionId(), label: "" },
    ];
    onChange({ ...value, options: next });
  }

  function removeOption(index: number) {
    if (value.options.length <= 2) return;
    onChange({
      ...value,
      options: value.options.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      <FormField label="Pregunta" required>
        <input
          type="text"
          value={value.question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="¿Cuál es tu opción favorita?"
          className={inputClass}
        />
      </FormField>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Opciones <span className="text-red-500">*</span>
        </p>
        <div className="space-y-2">
          {value.options.map((opt, i) => (
            <div key={opt.id} className="flex gap-2">
              <input
                type="text"
                value={opt.label}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Opción ${i + 1}`}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={value.options.length <= 2}
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label={`Eliminar opción ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOption}
          disabled={value.options.length >= 6}
          className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          + Agregar opción
        </button>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Mínimo 2, máximo 6 opciones.
        </p>
      </div>
    </div>
  );
}

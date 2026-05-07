import { FormField } from "../../ui/FormField";
import { inputClass, type WordCloudConfig } from "../types";

interface Props {
  value: WordCloudConfig;
  onChange: (next: WordCloudConfig) => void;
}

export function WordCloudFields({ value, onChange }: Props) {
  function set<K extends keyof WordCloudConfig>(
    key: K,
    next: WordCloudConfig[K]
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-4">
      <FormField label="Prompt para los asistentes" required>
        <input
          type="text"
          value={value.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          placeholder="¿Qué palabra describe AI para ti?"
          className={inputClass}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Palabras máx. por participante">
          <input
            type="number"
            min={1}
            max={10}
            value={value.maxWordsPerUser}
            onChange={(e) =>
              set(
                "maxWordsPerUser",
                Math.max(1, Math.min(10, Number(e.target.value) || 1))
              )
            }
            className={inputClass}
          />
        </FormField>

        <FormField label="Largo máximo (caracteres)">
          <input
            type="number"
            min={5}
            max={120}
            value={value.maxLength}
            onChange={(e) =>
              set(
                "maxLength",
                Math.max(5, Math.min(120, Number(e.target.value) || 60))
              )
            }
            className={inputClass}
          />
        </FormField>
      </div>
    </div>
  );
}

import { FormField } from "../../ui/FormField";
import {
  inputClass,
  newOptionId,
  newQuestionId,
  type QuizConfig,
  type QuizQuestion,
} from "../types";

interface Props {
  value: QuizConfig;
  onChange: (next: QuizConfig) => void;
}

function emptyQuestion(): QuizQuestion {
  const optA = newOptionId();
  return {
    id: newQuestionId(),
    prompt: "",
    options: [
      { id: optA, label: "" },
      { id: newOptionId(), label: "" },
    ],
    correctOptionId: optA,
    timeLimitSec: 30,
    points: 100,
  };
}

export function QuizFields({ value, onChange }: Props) {
  function setQuestion(index: number, next: QuizQuestion) {
    onChange({
      ...value,
      questions: value.questions.map((q, i) => (i === index ? next : q)),
    });
  }

  function addQuestion() {
    if (value.questions.length >= 50) return;
    onChange({ ...value, questions: [...value.questions, emptyQuestion()] });
  }

  function removeQuestion(index: number) {
    if (value.questions.length <= 1) return;
    onChange({
      ...value,
      questions: value.questions.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Define las preguntas del quiz. Cada pregunta tiene su propio
        temporizador y puntaje. Mínimo 1, máximo 50 preguntas.
      </p>

      {value.questions.map((q, qi) => (
        <QuestionEditor
          key={q.id}
          index={qi}
          value={q}
          onChange={(next) => setQuestion(qi, next)}
          onRemove={() => removeQuestion(qi)}
          canRemove={value.questions.length > 1}
        />
      ))}

      <button
        type="button"
        onClick={addQuestion}
        disabled={value.questions.length >= 50}
        className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        + Agregar pregunta
      </button>
    </div>
  );
}

interface QuestionEditorProps {
  index: number;
  value: QuizQuestion;
  onChange: (next: QuizQuestion) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function QuestionEditor({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
}: QuestionEditorProps) {
  function set<K extends keyof QuizQuestion>(key: K, next: QuizQuestion[K]) {
    onChange({ ...value, [key]: next });
  }

  function setOption(optIndex: number, label: string) {
    onChange({
      ...value,
      options: value.options.map((o, i) =>
        i === optIndex ? { ...o, label } : o
      ),
    });
  }

  function addOption() {
    if (value.options.length >= 6) return;
    onChange({
      ...value,
      options: [...value.options, { id: newOptionId(), label: "" }],
    });
  }

  function removeOption(optIndex: number) {
    if (value.options.length <= 2) return;
    const removed = value.options[optIndex];
    const nextOptions = value.options.filter((_, i) => i !== optIndex);
    onChange({
      ...value,
      options: nextOptions,
      // If we just removed the correct option, fall back to the first one.
      correctOptionId:
        value.correctOptionId === removed.id
          ? nextOptions[0].id
          : value.correctOptionId,
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Pregunta {index + 1}
        </h4>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Eliminar
        </button>
      </div>

      <div className="space-y-3">
        <FormField label="Enunciado" required>
          <input
            type="text"
            value={value.prompt}
            onChange={(e) => set("prompt", e.target.value)}
            placeholder="¿Cuál de estos modelos es multimodal?"
            className={inputClass}
          />
        </FormField>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Opciones <span className="text-red-500">*</span> · marca la correcta
          </p>
          <div className="space-y-2">
            {value.options.map((opt, oi) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${value.id}`}
                  checked={value.correctOptionId === opt.id}
                  onChange={() => set("correctOptionId", opt.id)}
                  className="h-4 w-4 text-blue-600"
                />
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => setOption(oi, e.target.value)}
                  placeholder={`Opción ${oi + 1}`}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeOption(oi)}
                  disabled={value.options.length <= 2}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  aria-label={`Eliminar opción ${oi + 1}`}
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
            className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            + Opción
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Tiempo límite (segundos)">
            <input
              type="number"
              min={5}
              max={300}
              value={value.timeLimitSec}
              onChange={(e) =>
                set(
                  "timeLimitSec",
                  Math.max(5, Math.min(300, Number(e.target.value) || 30))
                )
              }
              className={inputClass}
            />
          </FormField>
          <FormField label="Puntos">
            <input
              type="number"
              min={0}
              max={10000}
              value={value.points}
              onChange={(e) =>
                set(
                  "points",
                  Math.max(0, Math.min(10000, Number(e.target.value) || 0))
                )
              }
              className={inputClass}
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}

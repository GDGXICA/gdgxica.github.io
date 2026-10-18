import { FormField } from "../../ui/FormField";
import {
  inputClass,
  newOptionId,
  newQuestionId,
  type PollConfig,
  type PollQuestion,
} from "../types";

interface Props {
  value: PollConfig;
  onChange: (next: PollConfig) => void;
}

export function PollFields({ value, onChange }: Props) {
  const questions = value.questions ?? [
    { id: "main", prompt: value.question ?? "", options: value.options ?? [] },
  ];

  function changeQuestion(index: number, question: PollQuestion) {
    onChange({
      questions: questions.map((q, i) => (i === index ? question : q)),
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        El organizador mostrará una pregunta a la vez. Mínimo 1, máximo 50.
      </p>
      {questions.map((q, qi) => (
        <div
          key={q.id}
          className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-semibold">Pregunta {qi + 1}</h4>
            <button
              type="button"
              disabled={questions.length <= 1}
              onClick={() =>
                onChange({ questions: questions.filter((_, i) => i !== qi) })
              }
              className="text-sm text-red-600 disabled:opacity-40"
            >
              Eliminar
            </button>
          </div>
          <FormField label="Enunciado" required>
            <input
              type="text"
              value={q.prompt}
              onChange={(e) =>
                changeQuestion(qi, { ...q, prompt: e.target.value })
              }
              placeholder="¿Cuál es tu opción favorita?"
              className={inputClass}
            />
          </FormField>
          <div className="mt-4 space-y-2">
            {q.options.map((opt, oi) => (
              <div key={opt.id} className="flex gap-2">
                <input
                  type="text"
                  value={opt.label}
                  aria-label={`Opción ${oi + 1} de la pregunta ${qi + 1}`}
                  placeholder={`Opción ${oi + 1}`}
                  onChange={(e) =>
                    changeQuestion(qi, {
                      ...q,
                      options: q.options.map((o, i) =>
                        i === oi ? { ...o, label: e.target.value } : o
                      ),
                    })
                  }
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label={`Eliminar opción ${oi + 1}`}
                  disabled={q.options.length <= 2}
                  onClick={() =>
                    changeQuestion(qi, {
                      ...q,
                      options: q.options.filter((_, i) => i !== oi),
                    })
                  }
                  className="rounded-lg border px-3 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={q.options.length >= 6}
              onClick={() =>
                changeQuestion(qi, {
                  ...q,
                  options: [...q.options, { id: newOptionId(), label: "" }],
                })
              }
              className="rounded-lg border border-dashed px-3 py-2 text-sm disabled:opacity-40"
            >
              + Agregar opción
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={questions.length >= 50}
        onClick={() =>
          onChange({
            questions: [
              ...questions,
              {
                id: newQuestionId(),
                prompt: "",
                options: [
                  { id: newOptionId(), label: "" },
                  { id: newOptionId(), label: "" },
                ],
              },
            ],
          })
        }
        className="rounded-lg border border-dashed px-4 py-2 text-sm disabled:opacity-40"
      >
        + Agregar pregunta
      </button>
    </div>
  );
}

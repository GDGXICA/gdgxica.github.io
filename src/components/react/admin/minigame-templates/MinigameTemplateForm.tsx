import { useMemo, useState } from "react";
import { FormField } from "../ui/FormField";
import {
  TYPE_LABELS,
  emptyForType,
  inputClass,
  type MinigameType,
  type Template,
} from "./types";
import { PollFields } from "./forms/PollFields";
import { QuizFields } from "./forms/QuizFields";
import { WordCloudFields } from "./forms/WordCloudFields";
import { BingoFields } from "./forms/BingoFields";

interface Props {
  initial: Template;
  isEdit: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (template: Template) => void;
}

interface FormErrors {
  title?: string;
  config?: string;
}

function validate(template: Template): FormErrors {
  const errors: FormErrors = {};
  if (!template.title.trim()) {
    errors.title = "El título es obligatorio";
  }
  switch (template.type) {
    case "poll":
      if (!template.poll.question.trim()) {
        errors.config = "Falta la pregunta";
      } else if (template.poll.options.some((o) => !o.label.trim())) {
        errors.config = "Todas las opciones deben tener texto";
      }
      break;
    case "quiz":
      for (const q of template.quiz.questions) {
        if (!q.prompt.trim()) {
          errors.config = "Cada pregunta necesita un enunciado";
          break;
        }
        if (q.options.some((o) => !o.label.trim())) {
          errors.config =
            "Todas las opciones de cada pregunta deben tener texto";
          break;
        }
        if (!q.options.some((o) => o.id === q.correctOptionId)) {
          errors.config = "Cada pregunta debe marcar una opción correcta";
          break;
        }
      }
      break;
    case "wordcloud":
      if (!template.wordcloud.prompt.trim()) {
        errors.config = "Falta el prompt para los participantes";
      }
      break;
    case "bingo":
      if (template.bingo.terms.length < 16) {
        errors.config = "El bingo necesita al menos 16 términos";
      }
      break;
  }
  return errors;
}

export function MinigameTemplateForm({
  initial,
  isEdit,
  saving,
  onCancel,
  onSubmit,
}: Props) {
  const [template, setTemplate] = useState<Template>(initial);
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => validate(template), [template]);
  const hasErrors = Boolean(errors.title || errors.config);

  function setBase<K extends "title" | "description">(key: K, next: string) {
    setTemplate({ ...template, [key]: next });
  }

  function changeType(nextType: MinigameType) {
    if (nextType === template.type) return;
    setTemplate({
      ...emptyForType(nextType),
      title: template.title,
      description: template.description,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    onSubmit(template);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={onCancel}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        ← Volver a plantillas
      </button>
      <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
        {isEdit
          ? `Editar: ${template.title || "(sin título)"}`
          : "Nueva plantilla"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Tipo" required>
              <select
                value={template.type}
                onChange={(e) => changeType(e.target.value as MinigameType)}
                disabled={isEdit}
                className={inputClass}
                aria-label="Tipo de minijuego"
              >
                {(Object.keys(TYPE_LABELS) as MinigameType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {isEdit && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  El tipo no se puede cambiar al editar.
                </p>
              )}
            </FormField>

            <FormField
              label="Título"
              required
              error={submitted ? errors.title : undefined}
            >
              <input
                type="text"
                value={template.title}
                onChange={(e) => setBase("title", e.target.value)}
                placeholder="Quiz de bienvenida"
                className={inputClass}
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField label="Descripción (interna, opcional)">
                <textarea
                  value={template.description}
                  onChange={(e) => setBase("description", e.target.value)}
                  rows={2}
                  placeholder="Notas para el equipo organizador"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
            Configuración del {TYPE_LABELS[template.type].toLowerCase()}
          </h3>
          {template.type === "poll" && (
            <PollFields
              value={template.poll}
              onChange={(next) => setTemplate({ ...template, poll: next })}
            />
          )}
          {template.type === "quiz" && (
            <QuizFields
              value={template.quiz}
              onChange={(next) => setTemplate({ ...template, quiz: next })}
            />
          )}
          {template.type === "wordcloud" && (
            <WordCloudFields
              value={template.wordcloud}
              onChange={(next) => setTemplate({ ...template, wordcloud: next })}
            />
          )}
          {template.type === "bingo" && (
            <BingoFields
              value={template.bingo}
              onChange={(next) => setTemplate({ ...template, bingo: next })}
            />
          )}
          {submitted && errors.config && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {errors.config}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : isEdit
                ? "Actualizar"
                : "Crear plantilla"}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useId, useRef, useState } from "react";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { CloseIcon, buttonClass, inputClass } from "../ui/atlas";
import { parseRecipientsCsv } from "./parseRecipientsCsv";

/** One editable row. `key` is local: rows have no id until they are saved. */
export interface PersonDraft {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  hours: string;
}

let counter = 0;
export function blankPerson(
  over: Partial<Omit<PersonDraft, "key">> = {}
): PersonDraft {
  counter += 1;
  return {
    key: `p${counter}`,
    firstName: "",
    lastName: "",
    email: "",
    hours: "",
    ...over,
  };
}

const isBlank = (p: PersonDraft) =>
  !p.firstName.trim() &&
  !p.lastName.trim() &&
  !p.email.trim() &&
  !p.hours.trim();

export interface CheckedPeople {
  /** Rows with anything typed in, valid or not. */
  filled: number;
  /** Rows ready to send, blank rows left out, in order. */
  valid: {
    key: string;
    firstName: string;
    lastName: string;
    email: string;
    hours: number | null;
  }[];
  /** Problem per row key. */
  errors: Record<string, string>;
}

/**
 * Validates the rows the same way the API will: a name, an email zod
 * accepts, and, when given, positive hours. Rows left completely blank are
 * ignored, so the editor can always keep an empty row at the end.
 */
export function checkPeople(rows: PersonDraft[]): CheckedPeople {
  const valid: CheckedPeople["valid"] = [];
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    if (isBlank(row)) continue;
    const hours = row.hours.trim() ? Number(row.hours) : null;
    const email = normalizeEmail(row.email);
    const key =
      `${email}|${row.firstName.trim()} ${row.lastName.trim()}`.toLowerCase();
    if (!row.firstName.trim()) errors[row.key] = "Falta el nombre.";
    else if (!email) errors[row.key] = "Falta el correo.";
    else if (!isValidEmail(email))
      errors[row.key] = "Este correo no es válido.";
    else if (hours !== null && !(hours > 0 && hours <= 500))
      errors[row.key] = "Las horas deben ser un número mayor que 0.";
    else if (seen.has(key))
      errors[row.key] = "Esta persona ya está en la lista.";
    else {
      seen.add(key);
      valid.push({
        key: row.key,
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        email,
        hours,
      });
    }
  }
  return { filled: valid.length + Object.keys(errors).length, valid, errors };
}

/**
 * Maps the API's validation issues (`recipients.3.email`) back to the row
 * they came from, given the rows that were sent, in order.
 */
export function issuesByRow(
  issues: { path: string; message: string }[] | undefined,
  sent: { key: string }[],
  field: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues ?? []) {
    const m = new RegExp(`^${field}\\.(\\d+)\\.(\\w+)`).exec(issue.path);
    const row = m ? sent[Number(m[1])] : undefined;
    if (row) {
      out[row.key] =
        m![2] === "email" ? "El servidor rechazó este correo." : issue.message;
    }
  }
  return out;
}

interface Props {
  rows: PersonDraft[];
  onChange: (rows: PersonDraft[]) => void;
  /** Volunteers may be credited their own hours. */
  withHours?: boolean;
  /** Problems to show per row key; only after a send was attempted. */
  errors?: Record<string, string>;
  /** What the CSV import skipped, for the caller to show. */
  onImportNotice?: (message: string, tone: "success" | "error") => void;
}

/**
 * Rows of names, surnames and emails, typed in or imported from a CSV.
 * There is always one blank row at the end to type into.
 */
export function PeopleRowsEditor({
  rows,
  onChange,
  withHours = false,
  errors = {},
  onImportNotice,
}: Props) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const withBlank = (list: PersonDraft[]) =>
    list.length === 0 || !isBlank(list[list.length - 1])
      ? [...list, blankPerson()]
      : list;
  const shown = withBlank(rows);

  const update = (key: string, patch: Partial<PersonDraft>) =>
    onChange(
      withBlank(shown.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    );
  const remove = (key: string) => onChange(shown.filter((r) => r.key !== key));

  const importFile = async (file: File) => {
    const { rows: imported, warnings: found } = parseRecipientsCsv(
      await file.text()
    );
    setWarnings(found);
    if (imported.length === 0) {
      onImportNotice?.(
        found[0] ?? "El archivo no tiene filas con nombre y correo.",
        "error"
      );
      return;
    }
    const filled = shown.filter((r) => !isBlank(r));
    onChange(withBlank([...filled, ...imported.map((p) => blankPerson(p))]));
    onImportNotice?.(
      imported.length === 1
        ? "Se agregó 1 persona del archivo."
        : `Se agregaron ${imported.length} personas del archivo.`,
      "success"
    );
  };

  const columns = withHours
    ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_5.5rem_2rem]"
    : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2rem]";

  return (
    <div>
      <div
        className={`text-atlas-fog mb-1.5 hidden gap-2 text-xs font-semibold sm:grid ${columns}`}
        aria-hidden="true"
      >
        <span>Nombres</span>
        <span>Apellidos</span>
        <span>Correo</span>
        {withHours && <span>Horas</span>}
      </div>
      <ul className="space-y-2">
        {shown.map((row, i) => {
          const error = errors[row.key];
          const last = i === shown.length - 1;
          return (
            <li key={row.key}>
              <div className={`grid grid-cols-2 gap-2 ${columns}`}>
                <input
                  aria-label={`Nombres, fila ${i + 1}`}
                  className={inputClass}
                  value={row.firstName}
                  maxLength={100}
                  onChange={(e) =>
                    update(row.key, { firstName: e.target.value })
                  }
                  placeholder="Nombres"
                  aria-invalid={error ? true : undefined}
                />
                <input
                  aria-label={`Apellidos, fila ${i + 1}`}
                  className={inputClass}
                  value={row.lastName}
                  maxLength={100}
                  onChange={(e) =>
                    update(row.key, { lastName: e.target.value })
                  }
                  placeholder="Apellidos"
                />
                <input
                  aria-label={`Correo, fila ${i + 1}`}
                  type="email"
                  className={`${inputClass} col-span-2 sm:col-span-1`}
                  value={row.email}
                  maxLength={254}
                  onChange={(e) => update(row.key, { email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    error ? `${id}-${row.key}-error` : undefined
                  }
                />
                {withHours && (
                  <input
                    aria-label={`Horas, fila ${i + 1}`}
                    type="number"
                    min="0"
                    step="0.25"
                    inputMode="decimal"
                    className={inputClass}
                    value={row.hours}
                    onChange={(e) => update(row.key, { hours: e.target.value })}
                    placeholder="Evento"
                    title="Vacío: las horas del evento"
                  />
                )}
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  disabled={last && isBlank(row)}
                  className="text-atlas-fog hover:text-atlas-rose justify-self-end rounded-md p-2 transition-colors disabled:invisible"
                  aria-label={`Quitar la fila ${i + 1}`}
                >
                  <CloseIcon className="size-4" />
                </button>
              </div>
              {error && (
                <p
                  id={`${id}-${row.key}-error`}
                  className="text-atlas-rose mt-1 text-sm"
                >
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className={`${buttonClass.secondary} cursor-pointer`}>
          Importar CSV
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </label>
        <p className="text-atlas-fog text-sm">
          Columnas: nombres, apellidos y correo. El resto se ignora.
        </p>
      </div>
      {warnings.length > 0 && (
        <ul role="status" className="text-atlas-glow mt-2 space-y-1 text-sm">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { EMAIL_RE } from "@/lib/email";
import { HEARD_ABOUT_OPTIONS } from "./types";

interface Props {
  slug: string;
  ticketOptions: string[];
  initialQuery?: string;
  onClose: () => void;
  onRegistered: (attendee: {
    fullName: string;
    email: string;
    checkedIn: boolean;
  }) => void;
  onJumpToEmail: (email: string) => void;
}

const DEFAULT_TICKET = "General Admission";
const DNI_RE = /^[A-Za-z0-9-]{4,20}$/;

function buildTicketChoices(ticketOptions: string[]): string[] {
  const unique = new Set<string>([DEFAULT_TICKET]);
  for (const title of ticketOptions) {
    const trimmed = title.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}

function parseInitialQuery(raw?: string): {
  firstName: string;
  lastName: string;
  email: string;
  dni: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { firstName: "", lastName: "", email: "", dni: "" };
  if (trimmed.includes("@")) {
    return { firstName: "", lastName: "", email: trimmed, dni: "" };
  }
  if (/^\d{6,12}$/.test(trimmed)) {
    return { firstName: "", lastName: "", email: "", dni: trimmed };
  }
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    email: "",
    dni: "",
  };
}

export function ManualAttendeeModal({
  slug,
  ticketOptions,
  initialQuery,
  onClose,
  onRegistered,
  onJumpToEmail,
}: Props) {
  const choices = buildTicketChoices(ticketOptions);
  const prefill = parseInitialQuery(initialQuery);
  const [firstName, setFirstName] = useState(prefill.firstName);
  const [lastName, setLastName] = useState(prefill.lastName);
  const [email, setEmail] = useState(prefill.email);
  const [ticketTitle, setTicketTitle] = useState(choices[0]);
  const [dni, setDni] = useState(prefill.dni);
  const [heardAbout, setHeardAbout] = useState("");
  const [checkedIn, setCheckedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const firstNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  function validate(): string | null {
    if (!firstName.trim()) return "Ingresa el nombre del asistente.";
    if (!lastName.trim()) return "Ingresa los apellidos del asistente.";
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      return "Ingresa un correo electrónico válido.";
    }
    const trimmedDni = dni.trim();
    if (trimmedDni && !DNI_RE.test(trimmedDni)) {
      return "El DNI o documento debe tener entre 4 y 20 caracteres alfanuméricos.";
    }
    return null;
  }

  async function submit(keepOpen: boolean) {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setDuplicateEmail(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setDuplicateEmail(null);

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      ticketTitle: ticketTitle.trim() || DEFAULT_TICKET,
      dni: dni.trim(),
      heardAbout,
      checkedIn,
    };

    try {
      const res = await api.registerManualCheckinAttendee(slug, payload);
      if (res.success && res.data) {
        onRegistered({
          fullName: `${payload.firstName} ${payload.lastName}`,
          email: res.data.email,
          checkedIn: res.data.checkedIn,
        });
        if (keepOpen) {
          setFirstName("");
          setLastName("");
          setEmail("");
          setDni("");
          setHeardAbout("");
          setAddedCount((c) => c + 1);
          requestAnimationFrame(() => firstNameRef.current?.focus());
        } else {
          onClose();
        }
      } else {
        const message = res.error || "No se pudo registrar al asistente.";
        setError(message);
        if (res.data?.existingId || /ya existe/i.test(message)) {
          setDuplicateEmail(payload.email);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar al asistente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-attendee-title"
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-2xl sm:pb-6 dark:bg-gray-800"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="manual-attendee-title"
              className="text-lg font-bold text-gray-900 dark:text-white"
            >
              Agregar registro manual
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Para asistentes que no se registraron en Bevy. Se marcarán como
              «Sin Bevy» para exportarlos después.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {addedCount > 0 && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {addedCount === 1
              ? "1 asistente registrado. Puedes agregar otro."
              : `${addedCount} asistentes registrados en esta sesión.`}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
          >
            <p>{error}</p>
            {duplicateEmail && (
              <button
                type="button"
                onClick={() => {
                  onJumpToEmail(duplicateEmail);
                  onClose();
                }}
                className="mt-2 inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60"
              >
                Buscar {duplicateEmail} en la lista
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="mt-4 space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="manual-first-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                ref={firstNameRef}
                id="manual-first-name"
                type="text"
                required
                autoComplete="off"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="manual-last-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Apellidos <span className="text-red-500">*</span>
              </label>
              <input
                id="manual-last-name"
                type="text"
                required
                autoComplete="off"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="manual-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Correo electrónico <span className="text-red-500">*</span>
              </label>
              <input
                id="manual-email"
                type="email"
                required
                autoComplete="off"
                autoCapitalize="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="manual-ticket"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Boleto <span className="text-red-500">*</span>
              </label>
              <select
                id="manual-ticket"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {choices.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="manual-dni"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                DNI{" "}
                <span className="text-xs font-normal text-gray-400">
                  (opcional)
                </span>
              </label>
              <input
                id="manual-dni"
                type="text"
                autoComplete="off"
                placeholder="Ej. 12345678"
                maxLength={20}
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="manual-heard-about"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                ¿Cómo te enteraste?{" "}
                <span className="text-xs font-normal text-gray-400">
                  (opcional)
                </span>
              </label>
              <select
                id="manual-heard-about"
                value={heardAbout}
                onChange={(e) => setHeardAbout(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Sin especificar</option>
                {HEARD_ABOUT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={checkedIn}
              onChange={(e) => setCheckedIn(e.target.checked)}
              className="rounded border-gray-300"
            />
            Marcar como presente (check-in)
          </label>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              Cancelar
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void submit(true)}
                disabled={submitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {submitting ? "Guardando…" : "Guardar y agregar más"}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

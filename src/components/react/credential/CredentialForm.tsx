import { cloneElement, useId, useRef, useState } from "react";
import { CONSENT_ITEMS } from "@/lib/consent";
import { AvatarPicker } from "./AvatarPicker";
import {
  GOOGLE_TOOLS_OPTIONS,
  HEARD_ABOUT_OPTIONS,
  YEARS_OPTIONS,
  isValidDni,
  isValidEmail,
  isValidGithubUsername,
  type CardFields,
  type RegistrationFields,
} from "./types";

export type SubmitPhase = "idle" | "auth" | "saving";

interface Props {
  card: CardFields;
  onCardChange: (patch: Partial<CardFields>) => void;
  registration: RegistrationFields;
  onRegistrationChange: (patch: Partial<RegistrationFields>) => void;
  consentAccepted: boolean;
  onConsentChange: (value: boolean) => void;
  step: 1 | 2;
  onContinue: () => void;
  onBack: () => void;
  onSubmit: () => void;
  submitPhase: SubmitPhase;
  serverError: string | null;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactElement<React.AriaAttributes>;
}) {
  const errorId = useId();
  const control = error
    ? cloneElement(children, {
        "aria-invalid": true,
        "aria-describedby": errorId,
      })
    : children;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-secondary text-sm font-semibold">{label}</span>
      {control}
      {error && (
        <span id={errorId} className="text-xs font-medium text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}

const inputClass =
  "border-gray-custom focus:border-google-blue focus:ring-google-blue/15 min-h-11 rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:ring-4 disabled:bg-gray-50 disabled:text-gray-500";

export function CredentialForm({
  card,
  onCardChange,
  registration,
  onRegistrationChange,
  consentAccepted,
  onConsentChange,
  step,
  onContinue,
  onBack,
  onSubmit,
  submitPhase,
  serverError,
}: Props) {
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const submitting = submitPhase !== "idle";

  const cardReady =
    card.firstName.trim().length > 0 &&
    card.lastName.trim().length > 0 &&
    isValidGithubUsername(card.githubUsername.trim());

  const errors = {
    dni: isValidDni(registration.dni)
      ? undefined
      : "Ingresa los 8 dígitos de tu DNI.",
    email: isValidEmail(registration.email)
      ? undefined
      : "Ingresa un correo electrónico válido.",
    heardAbout: registration.heardAbout
      ? undefined
      : "Elige cómo te enteraste del evento.",
    heardAboutOther:
      registration.heardAbout !== "otro" || registration.heardAboutOther.trim()
        ? undefined
        : "Cuéntanos cómo te enteraste.",
    yearsExperience: registration.yearsExperience
      ? undefined
      : "Elige tu nivel de experiencia.",
    googleToolsLevel: registration.googleToolsLevel
      ? undefined
      : "Elige una opción.",
    consent: consentAccepted
      ? undefined
      : "Debes aceptar las condiciones para crear tu credencial.",
  };
  const registrationReady = Object.values(errors).every(
    (error) => error === undefined
  );

  if (step === 1) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <p className="text-google-blue text-xs font-bold tracking-[0.16em] uppercase">
            Paso 1 de 2
          </p>
          <h1 className="text-primary mt-2 text-3xl font-bold tracking-tight">
            Hazla tuya
          </h1>
          <p className="text-secondary mt-2 max-w-xl text-sm leading-6">
            Escribe tu nombre y elige un avatar. Verás los cambios al instante
            en la vista previa.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              className={inputClass}
              value={card.firstName}
              maxLength={60}
              autoComplete="given-name"
              onChange={(e) => onCardChange({ firstName: e.target.value })}
            />
          </Field>
          <Field label="Apellido">
            <input
              className={inputClass}
              value={card.lastName}
              maxLength={60}
              autoComplete="family-name"
              onChange={(e) => onCardChange({ lastName: e.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Usuario de GitHub (opcional)"
          error={
            card.githubUsername && !isValidGithubUsername(card.githubUsername)
              ? "Ese usuario de GitHub no es válido."
              : undefined
          }
        >
          <input
            className={inputClass}
            value={card.githubUsername}
            maxLength={39}
            autoComplete="off"
            placeholder="tuusuario"
            onChange={(e) =>
              onCardChange({ githubUsername: e.target.value.replace(/^@/, "") })
            }
          />
        </Field>

        <AvatarPicker
          avatarKind={card.avatarKind}
          mascotId={card.mascotId}
          photoDataUrl={card.photoDataUrl}
          onPickMascot={(id) =>
            onCardChange({ avatarKind: "mascot", mascotId: id })
          }
          onPickPhoto={(dataUrl) =>
            onCardChange({
              photoDataUrl: dataUrl,
              avatarKind: dataUrl ? "photo" : "mascot",
            })
          }
        />

        <button
          type="button"
          onClick={onContinue}
          disabled={!cardReady}
          className="bg-google-blue min-h-12 rounded-xl px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continuar con mis datos
        </button>
        {!cardReady && (
          <p className="text-tertiary -mt-3 text-center text-xs">
            Completa tu nombre y apellido para continuar.
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={formRef} className="flex flex-col gap-6">
      <header>
        <p className="text-google-blue text-xs font-bold tracking-[0.16em] uppercase">
          Paso 2 de 2
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-primary text-3xl font-bold tracking-tight">
              Completa tus datos
            </h1>
            <p className="text-secondary mt-2 max-w-xl text-sm leading-6">
              Los usaremos para emitir tu credencial. Después podrás completar
              tu inscripción oficial al evento.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="text-google-blue rounded-lg px-2 py-1 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
          >
            Editar nombre y avatar
          </button>
        </div>
      </header>

      <fieldset disabled={submitting} className="contents">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="DNI" error={touched ? errors.dni : undefined}>
            <input
              className={inputClass}
              value={registration.dni}
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              onChange={(e) =>
                onRegistrationChange({
                  dni: e.target.value.replace(/\D/g, "").slice(0, 8),
                })
              }
            />
          </Field>
          <Field
            label="Correo electrónico"
            error={touched ? errors.email : undefined}
          >
            <input
              className={inputClass}
              type="email"
              value={registration.email}
              autoComplete="email"
              maxLength={254}
              onChange={(e) => onRegistrationChange({ email: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Empresa u organización (opcional)">
          <input
            className={inputClass}
            value={registration.company}
            autoComplete="organization"
            maxLength={120}
            onChange={(e) => onRegistrationChange({ company: e.target.value })}
          />
        </Field>

        <Field
          label="¿Cómo te enteraste de este evento?"
          error={touched ? errors.heardAbout : undefined}
        >
          <select
            className={inputClass}
            value={registration.heardAbout}
            onChange={(e) =>
              onRegistrationChange({ heardAbout: e.target.value })
            }
          >
            <option value="">Elige una opción</option>
            {HEARD_ABOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        {registration.heardAbout === "otro" && (
          <Field
            label="Cuéntanos cómo"
            error={touched ? errors.heardAboutOther : undefined}
          >
            <input
              className={inputClass}
              value={registration.heardAboutOther}
              maxLength={120}
              onChange={(e) =>
                onRegistrationChange({ heardAboutOther: e.target.value })
              }
            />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Experiencia en desarrollo"
            error={touched ? errors.yearsExperience : undefined}
          >
            <select
              className={inputClass}
              value={registration.yearsExperience}
              onChange={(e) =>
                onRegistrationChange({ yearsExperience: e.target.value })
              }
            >
              <option value="">Elige una opción</option>
              {YEARS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Experiencia con Google Developer Tools"
            error={touched ? errors.googleToolsLevel : undefined}
          >
            <select
              className={inputClass}
              value={registration.googleToolsLevel}
              onChange={(e) =>
                onRegistrationChange({ googleToolsLevel: e.target.value })
              }
            >
              <option value="">Elige una opción</option>
              {GOOGLE_TOOLS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            touched && errors.consent
              ? "border-red-300 bg-red-50/40"
              : "border-gray-custom bg-gray-50/70"
          }`}
        >
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => onConsentChange(e.target.checked)}
              className="mt-1 h-4 w-4 accent-blue-600"
            />
            <span className="text-secondary leading-5">
              Confirmo que he leído y acepto las condiciones de participación,
              privacidad, conducta y tratamiento de datos, y que cumplo la
              condición de edad para participar.
            </span>
          </label>

          <details className="group mt-3 pl-7 text-sm">
            <summary className="text-google-blue cursor-pointer font-semibold">
              Ver condiciones y políticas
            </summary>
            <ul className="text-secondary mt-3 flex list-disc flex-col gap-2 pl-5 leading-5">
              {CONSENT_ITEMS.map((item) => (
                <li key={item.id}>
                  {item.label}
                  {item.href && item.linkLabel && (
                    <>
                      {" "}
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-google-blue underline"
                      >
                        {item.linkLabel}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>

          {touched && errors.consent && (
            <p
              role="alert"
              className="mt-3 pl-7 text-xs font-medium text-red-700"
            >
              {errors.consent}
            </p>
          )}
        </div>
      </fieldset>

      {serverError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {serverError}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setTouched(true);
          if (registrationReady) {
            onSubmit();
            return;
          }
          requestAnimationFrame(() => {
            formRef.current
              ?.querySelector<HTMLElement>("[aria-invalid='true']")
              ?.focus();
          });
        }}
        disabled={submitting}
        className="bg-google-blue min-h-12 rounded-xl px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-55"
      >
        {submitPhase === "auth"
          ? "Verificando sesión…"
          : submitPhase === "saving"
            ? "Creando credencial…"
            : "Crear mi credencial"}
      </button>
    </div>
  );
}

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
    <label className="flex flex-col gap-2">
      <span className="text-[0.9375rem] font-medium text-(--ink)">{label}</span>
      {control}
      {error && (
        <span id={errorId} className="text-sm font-medium text-red-300">
          {error}
        </span>
      )}
    </label>
  );
}

// 16px text so iOS does not zoom into the field on focus. The focus ring is
// the theme's global ochre outline; the border only confirms it.
const inputClass =
  "min-h-12 w-full rounded-(--radius-sm) border border-(--line-strong) bg-(--surface-1) px-3.5 py-2.5 text-base text-(--ink) transition-colors placeholder:text-(--muted)/70 hover:border-(--muted) focus:border-(--ochre) aria-[invalid=true]:border-red-400 disabled:opacity-60";

const titleClass =
  "m-0 font-(family-name:--font-display) text-[clamp(2.25rem,1.7rem+2.2vw,3.5rem)] leading-[0.95] font-bold tracking-[-0.02em] text-balance text-(--ink)";

const primaryButtonClass = "nb nb--primary w-full";

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

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
          <h1 className={titleClass}>Hazla tuya</h1>
          <p className="cred-dim n-mono">
            <span>Paso 1 de 2</span>
          </p>
          <p className="mt-4 max-w-xl text-(--muted)">
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

        <div className="flex flex-col gap-2.5 border-t border-(--line) pt-6">
          <button
            type="button"
            onClick={onContinue}
            disabled={!cardReady}
            className={primaryButtonClass}
          >
            <span className="nb__label">Continuar con mis datos</span>
            <span className="nb__icon nb__icon--arrow" aria-hidden="true">
              <ArrowIcon />
            </span>
          </button>
          {!cardReady && (
            <p className="text-sm text-(--muted)">
              Completa tu nombre y apellido para continuar.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={formRef} className="flex flex-col gap-6">
      <header>
        <h1 className={titleClass}>Completa tus datos</h1>
        <p className="cred-dim n-mono">
          <span>Paso 2 de 2</span>
        </p>
        <p className="mt-4 max-w-xl text-(--muted)">
          Los usaremos para emitir tu credencial y para que el equipo de GDG ICA
          complete tu registro oficial al evento.
        </p>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="n-link mt-2 inline-flex min-h-11 items-center text-[0.9375rem] disabled:opacity-50"
        >
          Editar nombre y avatar
        </button>
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
          className={`rounded-(--radius) border bg-(--surface-1) p-4 sm:p-5 ${
            touched && errors.consent ? "border-red-400/70" : "border-(--line)"
          }`}
        >
          <label className="flex items-start gap-3 text-[0.9375rem]">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => onConsentChange(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-(--ochre)"
            />
            <span className="leading-6 text-(--ink)">
              Confirmo que he leído y acepto las condiciones de participación,
              privacidad, conducta y tratamiento de datos, y que cumplo la
              condición de edad para participar.
            </span>
          </label>

          <details className="group mt-2 pl-8 text-[0.9375rem]">
            <summary className="n-link inline-flex min-h-11 cursor-pointer items-center">
              Ver condiciones y políticas
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-3 pl-5 leading-6 text-(--muted) marker:text-(--ochre)">
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
                        className="n-link text-(--ink)"
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
              className="mt-3 pl-8 text-sm font-medium text-red-300"
            >
              {errors.consent}
            </p>
          )}
        </div>
      </fieldset>

      {serverError && (
        <p
          role="alert"
          className="border-l-2 border-red-400 bg-(--surface-1) px-4 py-3 text-[0.9375rem] text-red-200"
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
        className={`${primaryButtonClass} nb--busy`}
      >
        <span className="nb__label">
          {submitPhase === "auth"
            ? "Verificando sesión…"
            : submitPhase === "saving"
              ? "Creando credencial…"
              : "Crear mi credencial"}
        </span>
        <span className="nb__icon nb__icon--arrow" aria-hidden="true">
          <ArrowIcon />
        </span>
      </button>
    </div>
  );
}

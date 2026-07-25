import { useState } from "react";
import { CONSENT_ITEMS, missingConsentMessage } from "@/lib/consent";
import { AvatarPicker } from "./AvatarPicker";
import {
  GOOGLE_TOOLS_OPTIONS,
  HEARD_ABOUT_OPTIONS,
  YEARS_OPTIONS,
  isValidDni,
  isValidEmail,
  isValidGithubUsername,
  type CardFields,
  type ConsentState,
  type RegistrationFields,
} from "./types";

interface Props {
  card: CardFields;
  onCardChange: (patch: Partial<CardFields>) => void;
  registration: RegistrationFields;
  onRegistrationChange: (patch: Partial<RegistrationFields>) => void;
  consents: ConsentState;
  onConsentChange: (id: string, value: boolean) => void;
  step: 1 | 2;
  onGenerate: () => void;
  onSubmit: () => void;
  submitting: boolean;
  serverError: string | null;
  fieldErrors: Record<string, string>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-secondary text-sm font-medium">{label}</span>
      {children}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </label>
  );
}

const inputClass =
  "border-gray-custom focus:border-google-blue rounded-lg border px-3 py-2 text-sm outline-none";

export function CredentialForm(props: Props) {
  const {
    card,
    onCardChange,
    registration,
    onRegistrationChange,
    consents,
    onConsentChange,
    step,
    onGenerate,
    onSubmit,
    submitting,
    serverError,
    fieldErrors,
  } = props;

  const [touched, setTouched] = useState(false);

  const cardReady =
    card.firstName.trim().length > 0 &&
    card.lastName.trim().length > 0 &&
    isValidGithubUsername(card.githubUsername.trim());

  const missingConsent = CONSENT_ITEMS.find((c) => !consents[c.id]);
  const registrationReady =
    isValidDni(registration.dni) &&
    isValidEmail(registration.email) &&
    registration.yearsExperience !== "" &&
    registration.googleToolsLevel !== "" &&
    registration.heardAbout !== "" &&
    (registration.heardAbout !== "otro" ||
      registration.heardAboutOther.trim().length > 0) &&
    !missingConsent;

  // Step 1 is entirely local and asks for nothing sensitive. The attendee
  // gets their shareable image BEFORE being asked for a DNI — that ordering
  // is the conversion decision, not a layout preference.
  if (step === 1) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="text-google-blue text-xs font-bold tracking-widest uppercase">
            Personaliza tu entrada
          </p>
          <h2 className="text-primary mt-1 text-2xl font-bold">
            Crea tu credencial
          </h2>
          <p className="text-secondary mt-1 text-sm">
            Elige tu avatar y compártela en tus redes. No te pedimos nada más
            todavía.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              className={inputClass}
              value={card.firstName}
              maxLength={60}
              onChange={(e) => onCardChange({ firstName: e.target.value })}
            />
          </Field>
          <Field label="Apellido">
            <input
              className={inputClass}
              value={card.lastName}
              maxLength={60}
              onChange={(e) => onCardChange({ lastName: e.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Usuario de GitHub (opcional)"
          error={
            card.githubUsername && !isValidGithubUsername(card.githubUsername)
              ? "Ese usuario de GitHub no es válido"
              : undefined
          }
        >
          <input
            className={inputClass}
            value={card.githubUsername}
            maxLength={39}
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
          onClick={onGenerate}
          disabled={!cardReady}
          className="bg-google-green rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          Generar credencial
        </button>
        {!cardReady && (
          <p className="text-tertiary text-xs">
            Completa tu nombre y apellido para continuar.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-google-blue text-xs font-bold tracking-widest uppercase">
          Último paso
        </p>
        <h2 className="text-primary mt-1 text-2xl font-bold">
          Completa tu inscripción
        </h2>
        <p className="text-secondary mt-1 text-sm">
          Con estos datos trasladamos tu inscripción al panel oficial del
          evento.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="DNI" error={fieldErrors.dni}>
          <input
            className={inputClass}
            value={registration.dni}
            inputMode="numeric"
            maxLength={8}
            onChange={(e) =>
              onRegistrationChange({
                dni: e.target.value.replace(/\D/g, "").slice(0, 8),
              })
            }
          />
        </Field>
        <Field label="Correo electrónico" error={fieldErrors.email}>
          <input
            className={inputClass}
            type="email"
            value={registration.email}
            maxLength={254}
            onChange={(e) => onRegistrationChange({ email: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Empresa u organización">
        <input
          className={inputClass}
          value={registration.company}
          maxLength={120}
          onChange={(e) => onRegistrationChange({ company: e.target.value })}
        />
      </Field>

      <Field label="¿Cómo te enteraste de este evento?">
        <select
          className={inputClass}
          value={registration.heardAbout}
          onChange={(e) => onRegistrationChange({ heardAbout: e.target.value })}
        >
          <option value="">Elige una opción</option>
          {HEARD_ABOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {registration.heardAbout === "otro" && (
        <Field label="Cuéntanos cómo" error={fieldErrors.heardAboutOther}>
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

      <Field label="Mi nivel de experiencia en desarrollo es…">
        <select
          className={inputClass}
          value={registration.yearsExperience}
          onChange={(e) =>
            onRegistrationChange({ yearsExperience: e.target.value })
          }
        >
          <option value="">Elige una opción</option>
          {YEARS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="¿Qué tan familiarizado estás con las Google Developer Tools?">
        <select
          className={inputClass}
          value={registration.googleToolsLevel}
          onChange={(e) =>
            onRegistrationChange({ googleToolsLevel: e.target.value })
          }
        >
          <option value="">Elige una opción</option>
          {GOOGLE_TOOLS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Every consent the official panel asks for is reproduced here,
          because a volunteer transcribing the record into Bevy cannot
          accept these terms on the attendee's behalf. */}
      <fieldset className="border-gray-custom flex flex-col gap-2 rounded-lg border p-4">
        <legend className="text-primary px-1 text-sm font-semibold">
          Condiciones
        </legend>
        {CONSENT_ITEMS.map((item) => (
          <label key={item.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(consents[item.id])}
              onChange={(e) => onConsentChange(item.id, e.target.checked)}
              className="mt-1"
            />
            <span className="text-secondary">
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
            </span>
          </label>
        ))}
      </fieldset>

      {serverError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {serverError}
        </p>
      )}

      {/* Naming the specific missing consent matters: a z.literal(true)
          rejection the attendee cannot trace back to a checkbox is a dead
          end, and this is the step where people abandon. */}
      {touched && missingConsent && (
        <p className="text-sm text-red-700">
          {missingConsentMessage(missingConsent.id)}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setTouched(true);
          if (registrationReady) onSubmit();
        }}
        disabled={submitting}
        className="bg-google-blue rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Guardando…" : "Guardar y continuar a la inscripción"}
      </button>
    </div>
  );
}

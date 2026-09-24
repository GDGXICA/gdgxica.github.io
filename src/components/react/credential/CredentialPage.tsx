import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent";
import { CredentialForm, type SubmitPhase } from "./CredentialForm";
import { CredentialPreview } from "./CredentialPreview";
import { ShareBar } from "./ShareBar";
import { DEFAULT_MASCOT_ID, findMascot } from "./mascots";
import { useFontsReady } from "./useFontsReady";
import { useDecodedImage } from "./useDecodedImages";
import { encodeUnderBudget, renderToCanvas } from "./exportCanvas";
import { MAX_CREDENTIAL_DATAURL_CHARS } from "./limits";
import type { CredentialRenderInput } from "./renderCredential";
import type {
  CardFields,
  CredentialEventInfo,
  RegistrationFields,
} from "./types";

interface Props {
  event: string;
}

const EMPTY_CARD: CardFields = {
  firstName: "",
  lastName: "",
  githubUsername: "",
  avatarKind: "mascot",
  mascotId: DEFAULT_MASCOT_ID,
  photoDataUrl: null,
};

const EMPTY_REGISTRATION: RegistrationFields = {
  dni: "",
  email: "",
  company: "",
  heardAbout: "",
  heardAboutOther: "",
  yearsExperience: "",
  googleToolsLevel: "",
};

const AUTH_TIMEOUT_MS = 10_000;

export function CredentialPage({ event: eventJson }: Props) {
  const event = useMemo<CredentialEventInfo>(
    () => JSON.parse(eventJson) as CredentialEventInfo,
    [eventJson]
  );

  const [card, setCard] = useState<CardFields>(EMPTY_CARD);
  const [registration, setRegistration] =
    useState<RegistrationFields>(EMPTY_REGISTRATION);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ groupLetter: string } | null>(null);
  const submissionIdRef = useRef<string | null>(null);

  const fontsReady = useFontsReady();
  const avatarSrc =
    card.avatarKind === "photo" && card.photoDataUrl
      ? card.photoDataUrl
      : (findMascot(card.mascotId)?.src ?? null);
  const avatar = useDecodedImage(avatarSrc);
  const qrImage = useDecodedImage(event.qrDataUrl);

  const renderInput: CredentialRenderInput = useMemo(
    () => ({
      headline: event.headline,
      eventName: event.eventName,
      eventDateLabel: event.eventDateLabel,
      firstName: card.firstName || "Tu nombre",
      lastName: card.lastName || "",
      githubUsername: card.githubUsername.trim() || null,
      groupLetter: done?.groupLetter ?? "—",
      avatar,
      qrImage,
      ctaLabel: "Inscríbete en gdgica.com",
    }),
    [event, card, avatar, qrImage, done]
  );

  const exportedImage = useMemo(() => {
    if (!done || typeof document === "undefined") return null;
    try {
      const canvas = renderToCanvas(renderInput);
      return encodeUnderBudget(canvas, MAX_CREDENTIAL_DATAURL_CHARS);
    } catch {
      return null;
    }
  }, [done, renderInput]);

  const invalidateSubmission = () => {
    submissionIdRef.current = null;
    setServerError(null);
  };

  const submit = async () => {
    setServerError(null);
    setSubmitPhase("auth");

    try {
      await withTimeout(signInAnonymouslyIfNeeded(), AUTH_TIMEOUT_MS);
      setSubmitPhase("saving");

      const submissionId =
        submissionIdRef.current ?? (submissionIdRef.current = newUuid());
      const res = await api.createCredential(event.slug, {
        submissionId,
        firstName: card.firstName.trim(),
        lastName: card.lastName.trim(),
        dni: registration.dni.trim(),
        email: registration.email.trim(),
        company: registration.company.trim(),
        githubUsername: card.githubUsername.trim() || null,
        heardAbout: registration.heardAbout as never,
        heardAboutOther: registration.heardAboutOther.trim(),
        yearsExperience: registration.yearsExperience as never,
        googleToolsLevel: registration.googleToolsLevel as never,
        consentGdgTerms: true,
        consentGooglePrivacy: true,
        consentCodeOfConduct: true,
        consentDataProcessing: true,
        consentAgeAttested: true,
        consentPolicyVersion: PRIVACY_POLICY_VERSION,
        avatarKind: card.avatarKind,
        mascotId: card.avatarKind === "mascot" ? card.mascotId : null,
        photoDataUrl: card.avatarKind === "photo" ? card.photoDataUrl : null,
        credentialImageDataUrl: null,
      });

      if (!res.success) {
        setServerError(res.error ?? "No pudimos crear tu credencial.");
        return;
      }

      const groupLetter = res.data?.groupLetter ?? "—";
      const credentialId = res.data?.credentialId;
      setDone({ groupLetter });

      if (credentialId) {
        try {
          const canvas = renderToCanvas({ ...renderInput, groupLetter });
          const encoded = encodeUnderBudget(
            canvas,
            MAX_CREDENTIAL_DATAURL_CHARS
          );
          if (encoded) {
            void api.attachCredentialImage(event.slug, credentialId, {
              credentialImageDataUrl: encoded.dataUrl,
            });
          }
        } catch {
          // The registration is already safe; attaching the JPEG is best effort.
        }
      }
    } catch (error) {
      setServerError(
        error instanceof Error && error.message === "AUTH_TIMEOUT"
          ? "La verificación de sesión tardó demasiado. Revisa tu conexión e inténtalo de nuevo."
          : "No pudimos verificar tu sesión. Recarga la página e inténtalo de nuevo."
      );
    } finally {
      setSubmitPhase("idle");
    }
  };

  const fileName = `credencial-${event.slug}.jpg`;
  const typedName = `${card.firstName} ${card.lastName}`.trim();
  const previewLabel = typedName
    ? `Vista previa de la credencial de ${typedName}`
    : "Vista previa de tu credencial";

  return (
    <div className="mx-auto max-w-[1180px]">
      <Progress current={done ? 3 : step} />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-10">
        <section className="border-gray-custom rounded-2xl border bg-white p-5 shadow-sm sm:p-7 lg:col-span-7">
          {done ? (
            <SuccessPanel event={event} groupLetter={done.groupLetter} />
          ) : (
            <CredentialForm
              card={card}
              onCardChange={(patch) => {
                invalidateSubmission();
                setCard((current) => ({ ...current, ...patch }));
              }}
              registration={registration}
              onRegistrationChange={(patch) => {
                invalidateSubmission();
                setRegistration((current) => ({ ...current, ...patch }));
              }}
              consentAccepted={consentAccepted}
              onConsentChange={(value) => {
                invalidateSubmission();
                setConsentAccepted(value);
              }}
              step={step}
              onContinue={() => setStep(2)}
              onBack={() => setStep(1)}
              onSubmit={submit}
              submitPhase={submitPhase}
              serverError={serverError}
            />
          )}
        </section>

        <aside className="lg:sticky lg:top-6 lg:col-span-5">
          <div className="border-gray-custom rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-primary text-sm font-semibold">Vista previa</p>
              <span className="text-tertiary text-xs">Formato 4:5</span>
            </div>
            <CredentialPreview
              input={renderInput}
              fontsReady={fontsReady}
              label={previewLabel}
            />
          </div>

          {done && (
            <div className="mt-4">
              <ShareBar
                imageDataUrl={exportedImage?.dataUrl ?? null}
                fileName={fileName}
                shareText={`${event.headline} — ${event.eventName}`}
                pageUrl={
                  typeof window !== "undefined" ? window.location.href : "/"
                }
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Progress({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Personaliza", "Tus datos", "Lista"];
  return (
    <ol className="mx-auto flex max-w-2xl items-center" aria-label="Progreso">
      {steps.map((label, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        const active = number <= current;
        return (
          <li
            key={label}
            className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            aria-current={number === current ? "step" : undefined}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                active
                  ? "bg-google-blue text-white"
                  : "border-gray-custom text-tertiary border bg-white"
              }`}
            >
              {number < current ? "✓" : number}
            </span>
            <span
              className={`ml-2 hidden text-xs font-semibold sm:inline ${active ? "text-primary" : "text-tertiary"}`}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span
                className={`mx-3 h-px flex-1 ${number < current ? "bg-google-blue" : "bg-gray-200"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SuccessPanel({
  event,
  groupLetter,
}: {
  event: CredentialEventInfo;
  groupLetter: string;
}) {
  return (
    <div className="flex flex-col gap-6" role="status">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
          ✓
        </span>
        <div>
          <p className="text-google-green text-xs font-bold tracking-[0.16em] uppercase">
            Credencial creada
          </p>
          <h1 className="text-primary mt-1 text-3xl font-bold tracking-tight">
            ¡Ya es tuya!
          </h1>
          <p className="text-secondary mt-2 text-sm leading-6">
            Ya puedes descargarla y compartirla. También la enviaremos a tu
            correo.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-blue-50 p-5">
        <p className="text-secondary text-xs font-bold tracking-widest uppercase">
          Tu grupo para las dinámicas
        </p>
        <p className="text-google-blue mt-1 text-4xl font-bold">
          {groupLetter}
        </p>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <p className="font-bold text-amber-950">Aún falta tu inscripción</p>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          La credencial no reserva una entrada. Completa el registro en el panel
          oficial del evento para asegurar tu participación.
        </p>
        <a
          href={event.registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-google-blue mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Completar mi inscripción oficial
        </a>
        <p className="mt-3 text-xs leading-5 text-amber-800">
          El panel oficial cierra la sesión después de 15 minutos.
        </p>
      </div>
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("AUTH_TIMEOUT")),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function newUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export default CredentialPage;

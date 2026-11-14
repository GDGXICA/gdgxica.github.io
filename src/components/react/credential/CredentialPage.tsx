import { useMemo, useRef, useState, type CSSProperties } from "react";
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
      ctaLabel: "Conoce el evento en gdgica.com",
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
      {done && <Confetti />}
      <Progress current={done ? 3 : step} />

      <div className="mt-8 grid grid-cols-1 items-start gap-12 sm:mt-10 lg:grid-cols-12 lg:gap-14">
        <section className="lg:col-span-7">
          {done ? (
            <SuccessPanel groupLetter={done.groupLetter} />
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

        <aside className="lg:sticky lg:top-24 lg:col-span-5">
          <div className="n-panel n-marks p-3 sm:p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
              <p className="text-[0.9375rem] font-medium text-(--ink)">
                Vista previa
              </p>
              <span className="n-mono text-(--muted)">Formato 4:5</span>
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
    <ol className="flex max-w-3xl items-center" aria-label="Progreso">
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
              className={`n-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) font-semibold ${
                number === current
                  ? "bg-(--ochre) text-(--ochre-ink)"
                  : active
                    ? "border border-(--ochre) text-(--ochre)"
                    : "border border-(--line-strong) text-(--muted)"
              }`}
            >
              {number < current ? "✓" : number}
            </span>
            <span
              className={`ml-2.5 text-[0.9375rem] font-medium ${number === current ? "inline text-(--ink)" : "hidden text-(--muted) sm:inline"}`}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span
                className={`mx-3 h-px flex-1 sm:mx-4 ${number < current ? "bg-(--ochre)" : "bg-(--line-strong)"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SuccessPanel({ groupLetter }: { groupLetter: string }) {
  return (
    <div className="flex flex-col gap-8" role="status">
      <div className="flex flex-col">
        <div className="order-2 mt-5 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-(--radius-sm) bg-(--ochre) text-sm font-bold text-(--ochre-ink)">
            ✓
          </span>
          <p className="n-mono m-0 text-(--ochre)">Todo salió bien</p>
        </div>
        <h1 className="order-1 m-0 font-(family-name:--font-display) text-[clamp(2.25rem,1.7rem+2.2vw,3.5rem)] leading-[0.95] font-bold tracking-[-0.02em] text-balance text-(--ink)">
          ¡Tu credencial está lista!
        </h1>
        <p className="order-3 mt-4 max-w-xl text-(--muted)">
          Guárdala, compártela y revisa tu correo. También te enviaremos una
          copia para que siempre la tengas a mano.
        </p>
      </div>

      <div className="flex items-center gap-5 border-t border-(--line) pt-7">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-(--radius) border border-(--ochre) bg-(--surface-2) font-(family-name:--font-display) text-5xl font-bold text-(--ochre)">
          {groupLetter}
        </span>
        <div>
          <p className="text-[0.9375rem] text-(--muted)">
            Tu equipo para las dinámicas
          </p>
          <p className="mt-0.5 text-xl font-semibold tracking-[-0.01em] text-(--ink)">
            Grupo {groupLetter}
          </p>
          <p className="mt-1 text-sm leading-6 text-(--muted)">
            Recuerda esta letra para las actividades del evento.
          </p>
        </div>
      </div>

      <div className="flex gap-4 border-t border-(--line) pt-7">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-sm) border border-(--line-strong) bg-(--surface-1) text-(--ochre)">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M12 8v4l2.5 1.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div>
          <p className="text-lg font-semibold tracking-[-0.01em] text-(--ink)">
            Registro oficial en proceso
          </p>
          <p className="mt-1 max-w-xl text-[0.9375rem] leading-7 text-(--muted)">
            El equipo de GDG ICA usará los datos que enviaste para completar tu
            inscripción en el panel oficial. No necesitas llenar otro
            formulario.
          </p>
          <p className="mt-2 text-[0.9375rem] font-medium text-(--ink)">
            Te confirmaremos por correo cuando la carga esté completada.
          </p>
        </div>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["#2463eb", "#ef4444", "#ebb308", "#16a34a"];

function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden"
    >
      {Array.from({ length: 36 }, (_, index) => {
        const style = {
          left: `${(index * 29 + 7) % 100}%`,
          width: `${6 + (index % 4) * 2}px`,
          height: `${10 + (index % 3) * 3}px`,
          backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          animationDelay: `${(index % 12) * 55}ms`,
          animationDuration: `${1900 + (index % 7) * 130}ms`,
          "--confetti-drift": `${((index * 37) % 180) - 90}px`,
          "--confetti-turn": `${540 + (index % 5) * 180}deg`,
        } as CSSProperties;

        return (
          <span
            key={index}
            className="animate-credential-confetti absolute -top-8 rounded-sm"
            style={style}
          />
        );
      })}
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

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { signInAnonymouslyIfNeeded } from "@/lib/firebase";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent";
import { CredentialForm } from "./CredentialForm";
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
  ConsentState,
  CredentialEventInfo,
  RegistrationFields,
} from "./types";

interface Props {
  /** Serialized as JSON by the Astro page — see the note in the .astro. */
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

export function CredentialPage({ event: eventJson }: Props) {
  // Astro serializes island props, and complex objects round-trip more
  // predictably as a JSON string — the same workaround SharedButton.jsx
  // uses for its hashtags array.
  const event = useMemo<CredentialEventInfo>(
    () => JSON.parse(eventJson) as CredentialEventInfo,
    [eventJson]
  );

  const [card, setCard] = useState<CardFields>(EMPTY_CARD);
  const [registration, setRegistration] =
    useState<RegistrationFields>(EMPTY_REGISTRATION);
  const [consents, setConsents] = useState<ConsentState>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ groupLetter: string } | null>(null);

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
      groupLetter: done?.groupLetter ?? "?",
      avatar,
      qrImage,
      ctaLabel: "Inscríbete en gdgica.com",
    }),
    [event, card, avatar, qrImage, done]
  );

  const exportedImage = useMemo(() => {
    if (step === 1 || typeof document === "undefined") return null;
    try {
      const canvas = renderToCanvas(renderInput);
      return encodeUnderBudget(canvas, MAX_CREDENTIAL_DATAURL_CHARS);
    } catch {
      return null;
    }
  }, [renderInput, step]);

  const submit = async () => {
    setSubmitting(true);
    setServerError(null);
    setFieldErrors({});

    // MUST come first: request() in src/lib/api.ts hard-returns
    // { success: false, error: "Not authenticated" } with no token, which
    // would surface as an English string in a Spanish form.
    await signInAnonymouslyIfNeeded();

    const res = await api.createCredential(event.slug, {
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
      // Always null here: the card is attached below, once the server
      // has told us the group letter. Sending it now would store a copy
      // with a placeholder in place of the letter.
      credentialImageDataUrl: null,
    });

    setSubmitting(false);

    if (!res.success) {
      setServerError(res.error ?? "No pudimos guardar tu inscripción.");
      return;
    }
    const groupLetter = res.data?.groupLetter ?? "?";
    const credentialId = res.data?.credentialId;
    setDone({ groupLetter });

    // The card is attached in a SECOND call rather than sent with create.
    // The group letter comes from a server-assigned sequence number, so a
    // card rendered before the response carries a placeholder where the
    // letter belongs — the first end-to-end run stored exactly that.
    if (credentialId) {
      try {
        const canvas = renderToCanvas({ ...renderInput, groupLetter });
        const encoded = encodeUnderBudget(canvas, MAX_CREDENTIAL_DATAURL_CHARS);
        if (encoded) {
          // Not awaited into the UI path: the attendee already has their
          // credential on screen, and a failed attach must not turn a
          // successful registration into an error message.
          void api.attachCredentialImage(event.slug, credentialId, {
            credentialImageDataUrl: encoded.dataUrl,
          });
        }
      } catch {
        // Same reasoning — the registration is the part that matters.
      }
    }
  };

  const fileName = `credencial-${event.slug}.jpg`;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <CredentialPreview input={renderInput} fontsReady={fontsReady} />
        {step === 2 && (
          <ShareBar
            imageDataUrl={exportedImage?.dataUrl ?? null}
            fileName={fileName}
            shareText={`${event.headline} — ${event.eventName}`}
            pageUrl={typeof window !== "undefined" ? window.location.href : "/"}
          />
        )}
      </div>

      <div>
        {done ? (
          <SuccessPanel event={event} groupLetter={done.groupLetter} />
        ) : (
          <CredentialForm
            card={card}
            onCardChange={(patch) => setCard((c) => ({ ...c, ...patch }))}
            registration={registration}
            onRegistrationChange={(patch) =>
              setRegistration((r) => ({ ...r, ...patch }))
            }
            consents={consents}
            onConsentChange={(id, value) =>
              setConsents((c) => ({ ...c, [id]: value }))
            }
            step={step}
            onGenerate={() => setStep(2)}
            onSubmit={submit}
            submitting={submitting}
            serverError={serverError}
            fieldErrors={fieldErrors}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The success screen is blunt on purpose.
 *
 * The whole risk of this hybrid funnel is someone filling our form, never
 * touching the official panel, and arriving on the day believing they are
 * registered. That is worse than never having a form at all, so the
 * registration CTA is the largest thing here and the wording leaves no
 * room to read the credential as proof of anything.
 */
function SuccessPanel({
  event,
  groupLetter,
}: {
  event: CredentialEventInfo;
  groupLetter: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-primary text-2xl font-bold">
        ¡Listo! Tu credencial ya es tuya
      </h2>
      <p className="text-secondary text-sm">
        Descárgala y compártela. También te la enviamos por correo.
      </p>

      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
        <p className="font-bold text-amber-900">Todavía no estás inscrito</p>
        <p className="mt-1 text-sm text-amber-900">
          Tu inscripción se completa en el panel oficial del evento. Generar la
          credencial no te registra.
        </p>
        <a
          href={event.registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-google-blue mt-4 inline-block rounded-lg px-5 py-3 font-semibold text-white"
        >
          Completar mi inscripción oficial
        </a>
        <p className="mt-3 text-xs text-amber-900">
          Ese panel cierra la sesión a los 15 minutos, así que ten tus datos a
          la mano antes de empezar.
        </p>
      </div>

      <p className="text-secondary text-sm">
        Tu grupo para las dinámicas del evento es el{" "}
        <strong className="text-primary">{groupLetter}</strong>.
      </p>
    </div>
  );
}

export default CredentialPage;

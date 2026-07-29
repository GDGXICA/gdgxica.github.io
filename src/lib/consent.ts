// Single source of truth for the consent the credential form collects.
//
// Imported by BOTH the Astro privacy-policy page and the React form, so
// the version rendered on screen and the `consentPolicyVersion` stored on
// the credential document cannot drift. A stored consent that names a
// version whose text we can no longer produce is not evidence of anything.
//
// Bumping PRIVACY_POLICY_VERSION is a deliberate act: it must be added to
// KNOWN_POLICY_VERSIONS in functions/src/schemas/credentials.ts in the
// same change, or every submission starts failing validation.

export const PRIVACY_POLICY_VERSION = "2026-08-01";

/** Human-readable form of the version above, for rendering. */
export const PRIVACY_POLICY_DATE_LABEL = "1 de agosto de 2026";

export const CONTACT_EMAIL = "aalvaropc@gmail.com";

export const CONSENT_LINKS = {
  // The agreement between the attendee and Google that governs taking part
  // in any GDG event — recording rights, liability, and how RSVP data is
  // shared with the local chapter. This is the document the official Bevy
  // panel links from its first checkbox.
  gdgEventTerms: "https://gdg.community.dev/participation-terms/",
  googlePrivacy: "https://policies.google.com/privacy",
  // Google's event community guidelines and anti-harassment policy. The
  // developers.google.com/community-guidelines address redirects here; the
  // canonical target is used directly so the link cannot break if that
  // redirect is ever retired.
  codeOfConduct:
    "https://www.google.com/events/policy/anti-harassmentpolicy.html",
  gdgIcaPrivacy: "/privacy-policy",
} as const;

export interface ConsentItem {
  /** Matches the field name on the credential document. */
  id:
    | "consentGdgTerms"
    | "consentGooglePrivacy"
    | "consentCodeOfConduct"
    | "consentDataProcessing"
    | "consentAgeAttested";
  label: string;
  linkLabel?: string;
  href?: string;
}

/**
 * The five boxes, none pre-checked.
 *
 * The form reproduces every consent the official Google/Bevy panel asks
 * for, because a volunteer transcribing the record into that panel cannot
 * accept those terms on the attendee's behalf.
 */
export const CONSENT_ITEMS: readonly ConsentItem[] = [
  {
    id: "consentGdgTerms",
    label: "He leído y acepto las",
    linkLabel: "Condiciones de Participación en los eventos GDG",
    href: CONSENT_LINKS.gdgEventTerms,
  },
  {
    id: "consentGooglePrivacy",
    label:
      "Acepto que Google use la información que le proporcione en relación con los eventos de Google Developer Groups, conforme a la",
    linkLabel: "Política de Privacidad de Google",
    href: CONSENT_LINKS.googlePrivacy,
  },
  {
    id: "consentCodeOfConduct",
    label: "Me comprometo a cumplir el",
    linkLabel: "Código de Conducta de los eventos GDG",
    href: CONSENT_LINKS.codeOfConduct,
  },
  {
    id: "consentDataProcessing",
    label:
      "Autorizo a GDG Ica a tratar mis datos para emitir mi credencial y trasladar mi inscripción al panel oficial, según la",
    linkLabel: "Política de Privacidad de GDG Ica",
    href: CONSENT_LINKS.gdgIcaPrivacy,
  },
  {
    id: "consentAgeAttested",
    label:
      "Soy mayor de edad o cuento con la autorización de mi padre, madre o apoderado para participar.",
  },
] as const;

export const CONSENT_IDS = CONSENT_ITEMS.map((c) => c.id);

/** Spanish copy for a consent the attendee left unchecked. */
export function missingConsentMessage(id: string): string {
  const item = CONSENT_ITEMS.find((c) => c.id === id);
  if (!item) return "Falta aceptar una de las condiciones";
  return `Falta aceptar: ${item.linkLabel ?? item.label}`;
}

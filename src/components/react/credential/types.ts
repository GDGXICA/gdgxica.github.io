export interface CredentialEventInfo {
  slug: string;
  eventName: string;
  eventDateLabel: string;
  headline: string;
  /** Official Bevy/Google panel. The only thing that actually registers. */
  registrationUrl: string;
  /** Build-time QR of registrationUrl, as a same-origin data URL. */
  qrDataUrl: string | null;
}

/** Step 1: everything needed to draw the card, all of it local. */
export interface CardFields {
  firstName: string;
  lastName: string;
  githubUsername: string;
  avatarKind: "photo" | "mascot";
  mascotId: string;
  /** data: URL, never blob: — see the CSP note in CredentialForm. */
  photoDataUrl: string | null;
}

/** Step 2: everything the official panel will need transcribed. */
export interface RegistrationFields {
  dni: string;
  email: string;
  company: string;
  heardAbout: string;
  heardAboutOther: string;
  yearsExperience: string;
  googleToolsLevel: string;
}

export type ConsentState = Record<string, boolean>;

export const HEARD_ABOUT_OPTIONS = [
  { value: "redes_sociales", label: "Redes sociales" },
  { value: "amigo_colega", label: "Un amigo o colega" },
  { value: "universidad", label: "Universidad" },
  { value: "meetup", label: "Meetup" },
  { value: "otro", label: "Otro" },
] as const;

export const YEARS_OPTIONS = [
  { value: "menos_1", label: "Menos de 1 año" },
  { value: "1_2", label: "1 a 2 años" },
  { value: "3_5", label: "3 a 5 años" },
  { value: "6_10", label: "6 a 10 años" },
  { value: "mas_10", label: "Más de 10 años" },
] as const;

export const GOOGLE_TOOLS_OPTIONS = [
  { value: "ninguna", label: "Ninguna" },
  { value: "basica", label: "Básica" },
  { value: "intermedia", label: "Intermedia" },
  { value: "avanzada", label: "Avanzada" },
] as const;

/**
 * Client-side mirror of the server's DNI rule.
 *
 * Validating here is about telling someone at the keyboard, not about
 * trust — credentialCreateSchema is the authority and rejects anything
 * else with a 400.
 */
export function isValidDni(dni: string): boolean {
  return /^\d{8}$/.test(dni.trim());
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** GitHub's own rule: alphanumerics with single internal hyphens, 1-39. */
export function isValidGithubUsername(value: string): boolean {
  if (!value) return true; // optional
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value);
}

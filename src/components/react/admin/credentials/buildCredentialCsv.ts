import type { Credential } from "./types";

// Builds the CSV consumed by Bevy's "Bulk upload attendees" dialog, so the
// pending queue can be loaded in one go instead of typed one record at a
// time against a 15-minute session timeout.
//
// Structurally mirrors checkin/buildBevyCsv.ts: a COLUMNS constant, RFC
// 4180 quoting, local-time filenames, and the same "only ever adds"
// philosophy.
//
// UNCONFIRMED: the survey column names below are a best guess at Bevy's
// template. Bevy names those columns after the exact question text
// (`survey:<pregunta>`), which we cannot know without exporting the real
// template from the live panel. They are collected here in one constant
// precisely so correcting them is a one-line change rather than a hunt
// through the module.
const SURVEY_COLUMNS = {
  heardAbout: "survey:¿Cómo te enteraste de este evento?",
  yearsExperience: "survey:Mi nivel de experiencia en desarrollo es...",
  googleToolsLevel:
    "survey:¿Qué tan familiarizado estás con las Google Developer Tools?",
} as const;

const COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "company",
  SURVEY_COLUMNS.heardAbout,
  SURVEY_COLUMNS.yearsExperience,
  SURVEY_COLUMNS.googleToolsLevel,
] as const;

// There is deliberately NO dni column: Bevy has no such field. The DNI's
// value is on-site identity verification, and it lives in our panel only —
// exporting it into a third-party upload would spread the most sensitive
// field we hold for no benefit.

const HEARD_ABOUT_LABEL: Record<string, string> = {
  redes_sociales: "Redes sociales",
  amigo_colega: "Un amigo o colega",
  universidad: "Universidad",
  meetup: "Meetup",
  otro: "Otro",
};

const YEARS_LABEL: Record<string, string> = {
  menos_1: "Menos de 1 año",
  "1_2": "1 a 2 años",
  "3_5": "3 a 5 años",
  "6_10": "6 a 10 años",
  mas_10: "Más de 10 años",
};

const GOOGLE_TOOLS_LABEL: Record<string, string> = {
  ninguna: "Ninguna",
  basica: "Básica",
  intermedia: "Intermedia",
  avanzada: "Avanzada",
};

export interface CredentialCsvResult {
  csv: string;
  /** Rows written — i.e. people this upload would register. */
  rows: number;
  /** Left out because they are no longer pending. */
  skipped: number;
}

/** RFC 4180 quoting. Surnames with commas are common enough to matter. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Produces an upload for every credential still pending load into Bevy.
 *
 * Anything already `loaded`, `not_found` or `discarded` is excluded, so
 * re-running after a partial upload stays small and cannot re-register
 * someone a volunteer already transcribed by hand.
 */
export function buildCredentialBevyCsv(
  credentials: Credential[]
): CredentialCsvResult {
  const pending = credentials
    .filter((c) => c.bevyStatus === "pending")
    // Sequence order so the export matches the on-screen queue and a
    // half-finished upload is easy to resume by eye.
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  const lines = [COLUMNS.map(cell).join(",")];
  for (const c of pending) {
    const heardAbout =
      c.heardAbout === "otro" && c.heardAboutOther
        ? c.heardAboutOther
        : (HEARD_ABOUT_LABEL[c.heardAbout] ?? c.heardAbout);

    lines.push(
      [
        cell(c.firstName),
        cell(c.lastName),
        cell(c.email),
        cell(c.company),
        cell(heardAbout),
        cell(YEARS_LABEL[c.yearsExperience] ?? c.yearsExperience),
        cell(GOOGLE_TOOLS_LABEL[c.googleToolsLevel] ?? c.googleToolsLevel),
      ].join(",")
    );
  }

  return {
    csv: `${lines.join("\r\n")}\r\n`,
    rows: pending.length,
    skipped: credentials.length - pending.length,
  };
}

/**
 * Filename built from LOCAL time, not UTC.
 *
 * The organizer picks the newest export by eye against a Lima clock, and a
 * UTC stamp would read as tomorrow's file all evening. Zero-padded so the
 * names sort chronologically in a downloads folder.
 */
export function credentialCsvFilename(slug: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `credenciales-${slug}-${stamp}.csv`;
}

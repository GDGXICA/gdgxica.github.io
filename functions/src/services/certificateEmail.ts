import type { CertificateKind } from "./certificateKinds";
import { htmlEscape, singleLine } from "./email";
import {
  sendEmail,
  type EmailTransport,
  type OutgoingEmail,
} from "./emailTransport";

// The certificate email.
//
// Goes through `sendEmail`, like the credential email, so the Gmail/Resend
// switch in the panel applies to certificates too. Names come from Bevy
// imports, CSVs and forms: singleLine() on every header value and
// htmlEscape() on every interpolated body value are not optional.

export interface CertificateEmail {
  kind: CertificateKind;
  to: string;
  recipientName: string;
  eventName: string;
  pdf: Uint8Array;
}

// Wording per certificate kind. `thanks` receives the event name already
// escaped for its channel (plain text, or <strong>…</strong> in HTML).
const COPY: Record<
  CertificateKind,
  { what: string; file: string; thanks: (event: string) => string }
> = {
  attendee: {
    what: "de participación",
    file: "participacion",
    thanks: (event) => `¡Gracias por participar en ${event}!`,
  },
  volunteer: {
    what: "de voluntariado",
    file: "voluntariado",
    thanks: (event) =>
      `¡Gracias por sumar tu tiempo y tu trabajo al equipo de voluntariado de ${event}!`,
  },
  speaker: {
    what: "de reconocimiento como speaker",
    file: "speaker",
    thanks: (event) => `¡Gracias por compartir tu conocimiento en ${event}!`,
  },
};

/** ASCII slug for the attachment filename. */
function asciiSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

/** The message, without sending it. Pure, so it can be tested. */
export function buildCertificateEmail(mail: CertificateEmail): OutgoingEmail {
  const eventName = singleLine(mail.eventName);
  const recipientName = singleLine(mail.recipientName);
  const copy = COPY[mail.kind];
  return {
    to: singleLine(mail.to),
    subject: `Tu certificado ${copy.what} — ${eventName}`,
    text:
      `Hola ${recipientName},\n\n` +
      `${copy.thanks(eventName)} ` +
      `Adjuntamos tu certificado ${copy.what} en PDF.\n\n` +
      `Un abrazo,\nComunidad GDG ICA`,
    html:
      `<p>Hola <strong>${htmlEscape(recipientName)}</strong>,</p>` +
      `<p>${copy.thanks(`<strong>${htmlEscape(eventName)}</strong>`)} ` +
      `Adjuntamos tu certificado ${copy.what} en PDF.</p>` +
      `<p>Un abrazo,<br/>Comunidad GDG ICA</p>`,
    attachments: [
      {
        filename: `certificado-${copy.file}-${asciiSlug(mail.eventName) || "gdg-ica"}.pdf`,
        content: Buffer.from(mail.pdf),
        contentType: "application/pdf",
      },
    ],
  };
}

/** Sends one certificate. Throws on failure: the queue retries on it. */
export async function sendCertificateEmail(
  transport: EmailTransport,
  mail: CertificateEmail
): Promise<void> {
  await sendEmail(transport, buildCertificateEmail(mail));
}

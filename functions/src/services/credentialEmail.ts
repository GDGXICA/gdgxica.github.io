import { htmlEscape, singleLine } from "./email";
import {
  DEFAULT_TRANSPORT,
  sendEmail,
  type EmailTransport,
} from "./emailTransport";

// The credential email.
//
// Mirrors sendCertificateEmail's shape: the same pooled transport, inline
// template strings, singleLine() on every header value and htmlEscape() on
// every interpolated body value. Attendee names come straight from a public
// form, so that hardening is not optional here.
//
// The public form captures the fields the organizer later uploads to Bevy.
// The first email therefore confirms receipt and sets the expectation that
// GDG ICA completes the official registration; it must not send the attendee
// through the same questionnaire a second time.

export type CredentialEmailTemplate =
  "credential" | "photo_removed" | "reminder";

export interface CredentialEmail {
  to: string;
  firstName: string;
  eventName: string;
  groupLetter: string;
  /** Official Bevy/Google registration URL for this event. */
  registrationUrl: string;
  /** Composed card, attached when it could be read back from Storage. */
  image: Buffer | null;
  template: CredentialEmailTemplate;
  /** Page to regenerate the credential, used by the take-down notice. */
  credentialPageUrl: string;
  /** Which service puts the message on the wire. */
  transport?: EmailTransport;
}

/** ASCII slug for the attachment filename, as in sendCertificateEmail. */
function asciiSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      // Keep printable ASCII only: NFD splits accents into base + combining
      // mark, and the mark is outside this range.
      .replace(/[^ -~]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "gdg-ica"
  );
}

export async function sendCredentialEmail(
  mail: CredentialEmail
): Promise<void> {
  const eventName = singleLine(mail.eventName);
  const firstName = singleLine(mail.firstName);

  const subject =
    mail.template === "photo_removed"
      ? `Actualizamos tu credencial — ${eventName}`
      : mail.template === "reminder"
        ? `Te falta un paso para asistir a ${eventName}`
        : `Tu credencial de ${eventName}`;

  const body =
    mail.template === "photo_removed"
      ? photoRemovedBody(mail, eventName, firstName)
      : mail.template === "reminder"
        ? reminderBody(mail, eventName, firstName)
        : credentialBody(mail, eventName, firstName);

  await sendEmail(mail.transport ?? DEFAULT_TRANSPORT, {
    to: mail.to,
    subject,
    text: body.text,
    html: body.html,
    attachments:
      mail.template !== "reminder" && mail.image
        ? [
            {
              filename: `credencial-${asciiSlug(mail.eventName)}.jpg`,
              content: mail.image,
              contentType: "image/jpeg",
            },
          ]
        : [],
  });
}

function credentialBody(
  _mail: CredentialEmail,
  eventName: string,
  firstName: string
) {
  const letter = singleLine(_mail.groupLetter);

  const text =
    `Hola ${firstName},\n\n` +
    `Aqui tienes tu credencial de ${eventName}. Compartela donde quieras.\n\n` +
    `Recibimos tus datos. El equipo de GDG ICA completara tu inscripcion ` +
    `en el panel oficial del evento; no necesitas llenar otro formulario.\n\n` +
    `Te confirmaremos por correo cuando la carga este completada.\n\n` +
    `Tu grupo para las dinamicas es el ${letter}.\n\n` +
    `Nos vemos,\nComunidad GDG ICA`;

  const html =
    `<p>Hola <strong>${htmlEscape(firstName)}</strong>,</p>` +
    `<p>Aquí tienes tu credencial de <strong>${htmlEscape(eventName)}</strong>. ` +
    `Compártela donde quieras.</p>` +
    `<p><strong>Recibimos tus datos.</strong> El equipo de GDG ICA completará ` +
    `tu inscripción en el panel oficial del evento; no necesitas llenar otro ` +
    `formulario.</p>` +
    `<p>Te confirmaremos por correo cuando la carga esté completada.</p>` +
    `<p>Tu grupo para las dinámicas es el ` +
    `<strong>${htmlEscape(letter)}</strong>.</p>` +
    `<p>Nos vemos,<br/>Comunidad GDG ICA</p>`;

  return { text, html };
}

function photoRemovedBody(
  mail: CredentialEmail,
  eventName: string,
  firstName: string
) {
  const url = mail.credentialPageUrl;

  const text =
    `Hola ${firstName},\n\n` +
    `Retiramos la foto de tu credencial de ${eventName} porque no cumplia ` +
    `con las pautas del evento, y la reemplazamos por un avatar ilustrado. ` +
    `Tu inscripcion no cambia.\n\n` +
    `Puedes generar una credencial nueva aqui:\n${url}\n\n` +
    `Si crees que fue un error, responde a este correo.\n\n` +
    `Comunidad GDG ICA`;

  const html =
    `<p>Hola <strong>${htmlEscape(firstName)}</strong>,</p>` +
    `<p>Retiramos la foto de tu credencial de ` +
    `<strong>${htmlEscape(eventName)}</strong> porque no cumplía con las ` +
    `pautas del evento, y la reemplazamos por un avatar ilustrado. ` +
    `<strong>Tu inscripción no cambia.</strong></p>` +
    `<p><a href="${htmlEscape(url)}">Genera una credencial nueva</a></p>` +
    `<p>Si crees que fue un error, responde a este correo.</p>` +
    `<p>Comunidad GDG ICA</p>`;

  return { text, html };
}

/**
 * The nudge for someone who has their credential but never finished
 * registering on the official panel.
 *
 * Deliberately short and single-purpose. The credential email already
 * explained everything; the only job here is the link, so anything else
 * competing with it makes the message worse.
 */
function reminderBody(
  mail: CredentialEmail,
  eventName: string,
  firstName: string
) {
  const url = mail.registrationUrl;

  const text =
    `Hola ${firstName},\n\n` +
    `Ya tienes tu credencial de ${eventName}, pero todavia no apareces ` +
    `inscrito en el panel oficial del evento. Sin ese paso no podemos ` +
    `reservarte un lugar.\n\n` +
    `Completa tu inscripcion aqui:\n${url}\n\n` +
    `El panel cierra la sesion a los 15 minutos, asi que ten tus datos a ` +
    `mano antes de empezar.\n\n` +
    `Si ya lo hiciste, ignora este correo.\n\n` +
    `Nos vemos,\nComunidad GDG ICA`;

  const html =
    `<p>Hola <strong>${htmlEscape(firstName)}</strong>,</p>` +
    `<p>Ya tienes tu credencial de <strong>${htmlEscape(eventName)}</strong>, ` +
    `pero <strong>todavía no apareces inscrito</strong> en el panel oficial ` +
    `del evento. Sin ese paso no podemos reservarte un lugar.</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" ` +
    `style="margin:24px 0"><tr><td style="background:#2463eb;border-radius:8px">` +
    `<a href="${htmlEscape(url)}" ` +
    `style="display:inline-block;padding:16px 28px;color:#ffffff;` +
    `font-size:17px;font-weight:700;text-decoration:none">` +
    `Completar mi inscripción</a></td></tr></table>` +
    `<p>El panel cierra la sesión a los <strong>15 minutos</strong>, así que ` +
    `ten tus datos a mano antes de empezar.</p>` +
    `<p>Si ya lo hiciste, ignora este correo.</p>` +
    `<p>Nos vemos,<br/>Comunidad GDG ICA</p>`;

  return { text, html };
}

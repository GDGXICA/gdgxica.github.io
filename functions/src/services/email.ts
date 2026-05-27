import nodemailer from "nodemailer";
import { GMAIL_USER, GMAIL_APP_PASSWORD } from "../config";

// Single transporter reused across invocations within a warm instance.
// Created lazily so the secrets are only read when a send actually
// happens (and so importing this module never throws at deploy time).
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  // Pool a single authenticated connection across messages. Without
  // pooling, every sendMail opens TCP+TLS+AUTH from scratch; with the
  // batch handler running multiple workers in parallel that triggers
  // Gmail's "454-4.7.0 Too many login attempts" guard and the rest of
  // the batch fails. One pooled connection authenticates once and
  // streams every certificate through it.
  transporter = nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_APP_PASSWORD.value(),
    },
  });
  return transporter;
}

export interface CertificateEmail {
  to: string;
  recipientName: string;
  eventName: string;
  pdf: Uint8Array;
}

// Collapse any control characters (CR/LF included) to a space so a
// crafted event/recipient name can't inject extra email headers.
function singleLine(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
}

// HTML-escape values interpolated into the message body so a name like
// `<a href="...">` from an imported CSV can't smuggle markup/links into
// the email and abuse the GDG sender reputation.
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sends one certificate email with the PDF attached. */
export async function sendCertificateEmail(
  mail: CertificateEmail
): Promise<void> {
  const fromName = "GDG ICA";
  const eventName = singleLine(mail.eventName);
  const recipientName = singleLine(mail.recipientName);
  const subject = `Tu certificado de participación — ${eventName}`;
  // ASCII slug for the attachment filename: NFD splits accents into
  // base + combining mark, then we strip everything non-ASCII and keep
  // only [a-z0-9] runs as dashes.
  const safeFile = mail.eventName
    .normalize("NFD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);

  await getTransporter().sendMail({
    from: `"${fromName}" <${GMAIL_USER.value()}>`,
    to: mail.to,
    subject,
    text:
      `Hola ${recipientName},\n\n` +
      `¡Gracias por participar en ${eventName}! ` +
      `Adjuntamos tu certificado de participación en PDF.\n\n` +
      `Un abrazo,\nComunidad GDG ICA`,
    html:
      `<p>Hola <strong>${htmlEscape(recipientName)}</strong>,</p>` +
      `<p>¡Gracias por participar en <strong>${htmlEscape(eventName)}</strong>! ` +
      `Adjuntamos tu certificado de participación en PDF.</p>` +
      `<p>Un abrazo,<br/>Comunidad GDG ICA</p>`,
    attachments: [
      {
        filename: `certificado-${safeFile || "gdg-ica"}.pdf`,
        content: Buffer.from(mail.pdf),
        contentType: "application/pdf",
      },
    ],
  });
}

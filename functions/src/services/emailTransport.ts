import { logger } from "firebase-functions";
import { GMAIL_USER, RESEND_API_KEY, RESEND_FROM } from "../config";
import { getTransporter } from "./email";

// Which service actually puts a message on the wire.
//
// The sender address is tied to the transport and cannot be chosen
// separately. Email authentication is what forbids it: gmail.com publishes
// the list of servers allowed to send as one of its addresses, Resend is
// not on it, and it cannot be added because we do not own gmail.com.
// Sending as a Gmail address through Resend would land in spam or be
// rejected outright, so "pick a sender" is really "pick a transport".

export type EmailTransport = "gmail" | "resend";

export const EMAIL_TRANSPORTS: readonly EmailTransport[] = ["gmail", "resend"];

export function isEmailTransport(value: unknown): value is EmailTransport {
  return (
    typeof value === "string" &&
    (EMAIL_TRANSPORTS as readonly string[]).includes(value)
  );
}

/**
 * Gmail is the default because it is what was configured first and needs no
 * new credentials. Switching to Resend is a deliberate act in the panel.
 */
export const DEFAULT_TRANSPORT: EmailTransport = "gmail";

/**
 * Daily send budget per transport.
 *
 * These are not arbitrary. Resend's free tier caps at 100 messages a day —
 * the monthly 3,000 never binds at this scale, but the daily one does — so
 * 90 leaves headroom for anything else the account sends. Gmail's consumer
 * limit is far higher but undocumented and enforced by suspension rather
 * than a clean rejection, so 350 stays a deliberately conservative guess.
 *
 * Hitting the cap delays credentials, it never drops them: the queue picks
 * up where it left off the next day, and the attendee already has their
 * card on screen before the email is even queued.
 */
export function dailyCapFor(transport: EmailTransport): number {
  return transport === "resend" ? 90 : 350;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** Sender shown to the recipient, per transport. */
function senderFor(transport: EmailTransport): string {
  return transport === "resend"
    ? RESEND_FROM.value() || "GDG ICA <no-reply@gdgica.com>"
    : `"GDG ICA" <${GMAIL_USER.value()}>`;
}

/**
 * Sends one message through the selected transport.
 *
 * Throws on failure rather than swallowing: the queue's retry and backoff
 * depend on hearing about it.
 */
export async function sendEmail(
  transport: EmailTransport,
  mail: OutgoingEmail
): Promise<void> {
  if (transport === "resend") {
    await sendViaResend(mail);
    return;
  }

  await getTransporter().sendMail({
    from: senderFor("gmail"),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments ?? [],
  });
}

async function sendViaResend(mail: OutgoingEmail): Promise<void> {
  const key = RESEND_API_KEY.value();
  if (!key) {
    // A clearer failure than whatever the API returns for an empty bearer
    // token, and it names the fix.
    throw new Error(
      "RESEND_API_KEY is not set; configure it or switch the transport back " +
        "to gmail in the admin panel"
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: senderFor("resend"),
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      // Replies reach the organiser's own inbox even though the message
      // leaves from the domain. This is the part of "send as my Gmail"
      // that email actually permits.
      reply_to: GMAIL_USER.value() || undefined,
      attachments: (mail.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });

  if (!res.ok) {
    // Bounded: the body can be long, and it lands in emailLastError which
    // the panel renders.
    const detail = await res.text().catch(() => "");
    logger.error("Resend rejected a message", {
      status: res.status,
      detail: detail.slice(0, 300),
    });
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}

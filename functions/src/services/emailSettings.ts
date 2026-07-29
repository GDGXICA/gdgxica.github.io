import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import {
  DEFAULT_TRANSPORT,
  isEmailTransport,
  type EmailTransport,
} from "./emailTransport";

// The chosen transport lives in Firestore rather than in an environment
// variable so it can be flipped from the panel without a deploy. That
// matters on the day of the event: if Resend starts failing, switching
// back to Gmail is a click, not a release.

const SETTINGS_PATH = { collection: "settings", doc: "email" } as const;

export function emailSettingsRef(): admin.firestore.DocumentReference {
  return admin
    .firestore()
    .collection(SETTINGS_PATH.collection)
    .doc(SETTINGS_PATH.doc);
}

/**
 * Reads the configured transport.
 *
 * Falls back to the default on a missing document, an unknown value, or a
 * read failure. This runs inside the scheduled drain, and a settings
 * problem must degrade to "keep sending the way we always did" rather than
 * stop the queue.
 */
export async function readEmailTransport(): Promise<EmailTransport> {
  try {
    const snap = await emailSettingsRef().get();
    const value = snap.data()?.transport;
    return isEmailTransport(value) ? value : DEFAULT_TRANSPORT;
  } catch (err) {
    logger.warn("Could not read the email transport setting", { err });
    return DEFAULT_TRANSPORT;
  }
}

export async function writeEmailTransport(
  transport: EmailTransport,
  uid: string
): Promise<void> {
  await emailSettingsRef().set(
    {
      transport,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true }
  );
}

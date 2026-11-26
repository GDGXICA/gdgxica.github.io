import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { getFunctions } from "firebase-admin/functions";
import { budgetDocId } from "./credentialQueue";

// Shared plumbing between the certificate endpoints and the drain.

/** Cloud Tasks queue of the drain; the function's export name. */
export const DRAIN_QUEUE = "drainCertificateEmails";

/**
 * The daily send budget, shared with the credential emails: both go out
 * through the same account, and the account's limit is what is being
 * protected, not a per-feature allowance.
 */
export function budgetRef(
  now: Date,
  db: admin.firestore.Firestore = admin.firestore()
): admin.firestore.DocumentReference {
  return db.collection("credential_email_budget").doc(budgetDocId(now));
}

export function certificateSettingsRef(
  slug: string,
  db: admin.firestore.Firestore = admin.firestore()
): admin.firestore.DocumentReference {
  return db
    .collection("events")
    .doc(slug)
    .collection("certificateMeta")
    .doc("settings");
}

/**
 * Asks the drain to run now. Best effort: if the task cannot be created,
 * the five-minute schedule picks the queue up anyway, so a failure here
 * delays certificates by minutes and must not fail the request.
 */
export async function kickCertificateDrain(): Promise<void> {
  try {
    await getFunctions().taskQueue(DRAIN_QUEUE).enqueue({});
  } catch (err) {
    logger.warn("Could not enqueue the certificate drain", { err });
  }
}

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

/**
 * Writes an audit log entry, awaiting the write so failures surface instead of
 * being silently dropped. The entry is stored verbatim (callers set their own
 * `timestamp`, e.g. a serverTimestamp or a transaction-local value).
 */
export async function writeAuditLog(
  entry: Record<string, unknown>
): Promise<void> {
  try {
    await admin.firestore().collection("audit_log").add(entry);
  } catch (err) {
    logger.error("Failed to write audit log", {
      action: entry.action,
      err,
    });
  }
}

/**
 * Triggers a site rebuild without blocking the response, logging a warning if
 * the dispatch fails instead of swallowing the error.
 */
export function triggerRebuildAndLog(github: {
  triggerRebuild: () => Promise<void>;
}): void {
  github.triggerRebuild().catch((err) => {
    logger.warn("Site rebuild trigger failed", err);
  });
}

import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { buildSearchTokens, parseBevyDate } from "../services/nameMatch";

// Firestore caps a WriteBatch at 500 operations; 400 leaves headroom.
const BATCH_SIZE = 400;

/** Bevy ticket numbers look like GOOGA263171317, but sanitize anyway —
 *  this value becomes a document ID and Firestore rejects "/" and "..". */
function attendeeId(ticketNumber: string): string {
  return `t_${ticketNumber.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

interface RosterRow {
  ticketNumber: string;
  orderNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  ticketTitle: string;
  bevyCheckinAt: string;
}

/**
 * POST /api/events/:slug/checkin/import
 *
 * Imports the parsed Bevy registrations CSV into
 * events/{slug}/roster/{attendeeId}.
 *
 * Idempotent by construction: the merge payload contains only roster
 * fields, never checkedIn*, so re-importing an updated export (people
 * register right up to the doors opening) cannot clobber check-ins that
 * already happened. No check-in fields are written at all, not even
 * defaults — absence reads as "not checked in" on both the client and in
 * the rules, which keeps the guarantee structural instead of conditional
 * on a prior existence read that two concurrent imports could race.
 */
export async function importRoster(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const rawRows = (req.body.rows ?? []) as RosterRow[];

    if (rawRows.length === 0) {
      res.status(400).json({ success: false, error: "No hay filas que importar" });
      return;
    }

    // Dedup on the DOCUMENT ID, not the raw ticket number. attendeeId() is
    // lossy — it strips everything outside [A-Za-z0-9_-] — so "GOOGA 123"
    // and "GOOGA123" are distinct strings that address the same document.
    // Keying the set on the raw value let both through, and the second
    // write silently replaced the first: one registrant vanished from the
    // roster and could not be checked in at the door.
    const rows: RosterRow[] = [];
    const seen = new Set<string>();
    let unusableTickets = 0;
    for (const row of rawRows) {
      const id = attendeeId(row.ticketNumber);
      // A ticket of pure punctuation sanitizes to the bare prefix, which
      // would collapse every such row onto one shared document.
      if (id === "t_") {
        unusableTickets++;
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }

    if (rows.length === 0) {
      res.status(400).json({
        success: false,
        error: "Ninguna fila tiene un número de ticket utilizable",
      });
      return;
    }

    const db = admin.firestore();
    const rosterRef = db.collection(`events/${slug}/roster`);

    // Counts only — never correctness. An earlier version decided whether
    // to write check-in defaults from this snapshot, which raced: a
    // concurrent import reading before the other committed would see a doc
    // as new and merge checkedIn:false over a check-in that had already
    // happened. Nothing below depends on it now.
    const existingSnap = await rosterRef.select().get();
    const existing = new Set(existingSnap.docs.map((d) => d.id));

    const importId = `imp_${Date.now()}`;
    let created = 0;
    let updated = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const row of rows.slice(i, i + BATCH_SIZE)) {
        const id = attendeeId(row.ticketNumber);
        const isNew = !existing.has(id);

        const rosterFields: Record<string, unknown> = {
          ticketNumber: row.ticketNumber,
          orderNumber: row.orderNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          company: row.company,
          title: row.title,
          ticketTitle: row.ticketTitle,
          searchTokens: buildSearchTokens(row),
          // Refreshed every import on purpose: this is how the panel
          // learns who was already checked in on Bevy itself.
          bevyCheckinAt: parseBevyDate(row.bevyCheckinAt),
          lastImportId: importId,
          importedAt: FieldValue.serverTimestamp(),
        };

        // Counters only. The import deliberately writes NO check-in fields
        // at all — not even defaults on a seemingly-new document. Absence
        // is the default: useRoster reads `data.checkedIn === true`, and
        // the rules constrain request.resource.data (the post-write state,
        // which the client always populates), not what is already stored.
        // That makes "an import can never disturb a check-in" a structural
        // property rather than something conditional on a prior read.
        if (isNew) created++;
        else updated++;

        batch.set(rosterRef.doc(id), rosterFields, { merge: true });
      }
      await batch.commit();
    }

    // Attendees present in a previous import but absent here (refunds,
    // cancellations) are deliberately NOT deleted — they may already be
    // checked in. They keep an older lastImportId, which the panel uses
    // to flag them without losing their state.
    // Clamped: `updated` counts rows matched against a snapshot taken
    // before the batches ran, so a concurrent import can push it past the
    // snapshot size. Cosmetic either way, but a negative count reads as a
    // bug to whoever sees it in the audit log.
    const stale = Math.max(0, existingSnap.size - updated);

    await db.doc(`events/${slug}/checkinMeta/current`).set(
      {
        lastImportId: importId,
        lastImportAt: FieldValue.serverTimestamp(),
        lastImportBy: user.uid,
        lastImportByName: user.displayName || user.email || user.uid,
        rosterCount: rows.length,
      },
      { merge: true }
    );

    await writeAuditLog({
      action: "checkin.import",
      performedBy: user.uid,
      targetId: slug,
      targetType: "checkin_roster",
      details: {
        importId,
        total: rows.length,
        created,
        updated,
        stale,
        unusableTickets,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      data: {
        importId,
        total: rows.length,
        created,
        updated,
        stale,
        unusableTickets,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

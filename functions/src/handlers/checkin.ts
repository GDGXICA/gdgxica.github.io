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
 * already happened. Check-in defaults are written only for documents
 * that do not exist yet.
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

    // The browser parser already drops duplicate tickets, but this
    // endpoint is reachable directly by any organizer. Two rows sharing a
    // ticket number would write the same document twice and skew the
    // created/updated counts, which would in turn make `stale` negative.
    const rows: RosterRow[] = [];
    const seen = new Set<string>();
    for (const row of rawRows) {
      if (seen.has(row.ticketNumber)) continue;
      seen.add(row.ticketNumber);
      rows.push(row);
    }

    const db = admin.firestore();
    const rosterRef = db.collection(`events/${slug}/roster`);

    // Which attendees already exist decides whether this import may write
    // check-in defaults. select() with no fields fetches IDs only.
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

        if (isNew) {
          // Only ever set on creation. The rules require checkedIn to be
          // a bool, so a doc without it would be unwritable.
          Object.assign(rosterFields, {
            checkedIn: false,
            checkedInAt: null,
            checkedInBy: null,
            checkedInByName: null,
            note: null,
            dniVerified: false,
            dniVerifiedAt: null,
            dniMatchScore: null,
            dniMatchedName: null,
          });
          created++;
        } else {
          updated++;
        }

        batch.set(rosterRef.doc(id), rosterFields, { merge: true });
      }
      await batch.commit();
    }

    // Attendees present in a previous import but absent here (refunds,
    // cancellations) are deliberately NOT deleted — they may already be
    // checked in. They keep an older lastImportId, which the panel uses
    // to flag them without losing their state.
    const stale = existingSnap.size - updated;

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
      details: { importId, total: rows.length, created, updated, stale },
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      data: { importId, total: rows.length, created, updated, stale },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

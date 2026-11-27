import crypto from "crypto";
import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { buildSearchTokens, parseBevyDate } from "../services/nameMatch";
import type { CheckinManualAttendeeBody } from "../schemas";

// Firestore caps a WriteBatch at 500 operations; 400 leaves headroom.
const BATCH_SIZE = 400;

/** Bevy ticket numbers look like GOOGA263171317, but sanitize anyway —
 *  this value becomes a document ID and Firestore rejects "/" and "..". */
function attendeeId(ticketNumber: string): string {
  return `t_${ticketNumber.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function manualAttendeeId(normalizedEmail: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(normalizedEmail)
    .digest("hex")
    .slice(0, 16);
  return `m_${hash}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDni(dni: string): string {
  return dni.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
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

interface ManualDocEntry {
  id: string;
  data: FirebaseFirestore.DocumentData;
}

function mergeManualDataIntoBevyFields(
  rosterFields: Record<string, unknown>,
  row: RosterRow,
  manualData: FirebaseFirestore.DocumentData,
  isNewBevyDoc: boolean
): void {
  const manualDni =
    typeof manualData.dni === "string" && manualData.dni.trim()
      ? manualData.dni.trim()
      : null;
  if (manualDni) {
    rosterFields.dni = manualDni;
    rosterFields.dniNormalized = normalizeDni(manualDni);
    rosterFields.searchTokens = buildSearchTokens({ ...row, dni: manualDni });
  }
  if (typeof manualData.heardAbout === "string" && manualData.heardAbout) {
    rosterFields.heardAbout = manualData.heardAbout;
  }
  if (isNewBevyDoc && manualData.checkedIn === true) {
    rosterFields.checkedIn = true;
    rosterFields.checkedInAt =
      manualData.checkedInAt ?? FieldValue.serverTimestamp();
    rosterFields.checkedInBy = manualData.checkedInBy ?? null;
    rosterFields.checkedInByName = manualData.checkedInByName ?? null;
    rosterFields.lastActionBy =
      manualData.lastActionBy ?? manualData.checkedInBy ?? null;
    rosterFields.lastActionByName =
      manualData.lastActionByName ?? manualData.checkedInByName ?? null;
    rosterFields.lastActionAt =
      manualData.lastActionAt ??
      manualData.checkedInAt ??
      FieldValue.serverTimestamp();
  }
}

function buildManualAttendeeDoc(
  body: CheckinManualAttendeeBody,
  actor: { uid: string; name: string }
): Record<string, unknown> {
  const email = normalizeEmail(body.email);
  const dni = body.dni.trim();
  const heardAbout = body.heardAbout.trim();
  const doc: Record<string, unknown> = {
    source: "manual",
    ticketNumber: "",
    orderNumber: "",
    firstName: body.firstName,
    lastName: body.lastName,
    email,
    company: "",
    title: "",
    ticketTitle: body.ticketTitle,
    dni: dni || null,
    dniNormalized: dni ? normalizeDni(dni) : null,
    heardAbout: heardAbout || null,
    searchTokens: buildSearchTokens({
      firstName: body.firstName,
      lastName: body.lastName,
      email,
      ticketNumber: "",
      dni,
    }),
    bevyCheckinAt: null,
    lastImportId: "",
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid,
    createdByName: actor.name,
  };

  if (body.checkedIn) {
    doc.checkedIn = true;
    doc.checkedInAt = FieldValue.serverTimestamp();
    doc.checkedInBy = actor.uid;
    doc.checkedInByName = actor.name;
    doc.lastActionBy = actor.uid;
    doc.lastActionByName = actor.name;
    doc.lastActionAt = FieldValue.serverTimestamp();
  } else {
    doc.checkedIn = false;
  }

  return doc;
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
      res
        .status(400)
        .json({ success: false, error: "No hay filas que importar" });
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
    const [existingSnap, manualSnap] = await Promise.all([
      rosterRef.select().get(),
      rosterRef.where("source", "==", "manual").get(),
    ]);
    const manualIds = new Set<string>();
    const manualByEmail = new Map<string, ManualDocEntry>();
    for (const d of manualSnap.docs) {
      manualIds.add(d.id);
      const data = d.data();
      const emailKey =
        typeof data.email === "string" ? normalizeEmail(data.email) : "";
      if (emailKey && !manualByEmail.has(emailKey)) {
        manualByEmail.set(emailKey, { id: d.id, data });
      }
    }
    const existing = new Set(
      existingSnap.docs.map((d) => d.id).filter((id) => !manualIds.has(id))
    );

    const importId = `imp_${Date.now()}`;
    let created = 0;
    let updated = 0;
    let mergedManual = 0;

    let batch = db.batch();
    let opsInBatch = 0;

    for (const row of rows) {
      const id = attendeeId(row.ticketNumber);
      const isNew = !existing.has(id);
      const emailKey = normalizeEmail(row.email);
      const matchedManual = manualByEmail.get(emailKey);
      const opsNeeded = matchedManual ? 2 : 1;

      if (opsInBatch + opsNeeded > BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }

      const rosterFields: Record<string, unknown> = {
        source: "bevy",
        ticketNumber: row.ticketNumber,
        orderNumber: row.orderNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        email: emailKey,
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

      if (matchedManual) {
        mergeManualDataIntoBevyFields(
          rosterFields,
          row,
          matchedManual.data,
          isNew
        );
        batch.delete(rosterRef.doc(matchedManual.id));
        manualByEmail.delete(emailKey);
        mergedManual++;
      }

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
      opsInBatch += opsNeeded;
    }

    if (opsInBatch > 0) {
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
    const stale = Math.max(0, existing.size - updated);

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

    await writeAuditLog(
      {
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
          mergedManual,
        },
      },
      req
    );

    res.json({
      success: true,
      data: {
        importId,
        total: rows.length,
        created,
        updated,
        stale,
        unusableTickets,
        mergedManual,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function registerManualAttendee(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const body = req.body as CheckinManualAttendeeBody;
    const email = normalizeEmail(body.email);

    const db = admin.firestore();
    const rosterRef = db.collection(`events/${slug}/roster`);

    const duplicateSnap = await rosterRef
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      const existingDoc = duplicateSnap.docs[0];
      const existingData = existingDoc.data();
      res.status(409).json({
        success: false,
        error:
          "Ya existe un asistente registrado con ese correo en este evento.",
        data: {
          existingId: existingDoc.id,
          source: existingData.source === "manual" ? "manual" : "bevy",
          checkedIn: existingData.checkedIn === true,
        },
      });
      return;
    }

    const docId = manualAttendeeId(email);
    const actor = {
      uid: user.uid,
      name: user.displayName || user.email || user.uid,
    };
    const docData = buildManualAttendeeDoc(body, actor);

    try {
      await rosterRef.doc(docId).create(docData);
    } catch (createErr) {
      if (isAlreadyExistsError(createErr)) {
        res.status(409).json({
          success: false,
          error:
            "Ya existe un asistente registrado con ese correo en este evento.",
          data: {
            existingId: docId,
            source: "manual",
            checkedIn: body.checkedIn,
          },
        });
        return;
      }
      throw createErr;
    }

    await writeAuditLog(
      {
        action: "checkin.manual.create",
        performedBy: user.uid,
        targetId: docId,
        targetType: "roster_attendee",
        details: {
          eventSlug: slug,
          checkedIn: body.checkedIn,
          ticketTitle: body.ticketTitle,
          hasDni: Boolean(body.dni.trim()),
          hasHeardAbout: Boolean(body.heardAbout.trim()),
        },
      },
      req
    );

    res.status(201).json({
      success: true,
      data: {
        id: docId,
        source: "manual" as const,
        email,
        checkedIn: body.checkedIn,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

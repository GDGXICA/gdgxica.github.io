import type { Attendee } from "./types";

// Builds the CSV consumed by Bevy's "Bulk upload attendees" dialog.
//
// The template Bevy hands out carries more columns (job_title, company,
// ticket_type and one survey:* per configured question), but only these
// four are relevant to reconciling check-in, so the rest are omitted
// deliberately rather than filled with blanks.
const COLUMNS = ["first_name", "last_name", "email", "checked_in"] as const;

export interface BevyCsvResult {
  csv: string;
  /** Rows written — i.e. people this upload would mark present. */
  rows: number;
  /** Marked here but Bevy already has them; left out to keep the upload minimal. */
  alreadyInBevy: number;
}

/** RFC 4180 quoting. Surnames with commas are common enough to matter. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Produces an upload for everyone marked present in the panel.
 *
 * Two deliberate omissions:
 *
 * - Absentees are never included. Bevy is the system of record, and a
 *   volunteer may have checked someone in from the Bevy app directly; a
 *   row saying checked_in=FALSE would undo that. This upload only ever
 *   adds check-ins, never removes them.
 * - Anyone Bevy already has checked in is skipped, so re-running after a
 *   partial upload stays small and touches as little as possible.
 */
export function buildBevyCheckinCsv(attendees: Attendee[]): BevyCsvResult {
  const present = attendees.filter((a) => a.checkedIn);
  const pending = present.filter((a) => !a.bevyCheckinAt);

  const lines = [COLUMNS.join(",")];
  for (const a of pending) {
    lines.push(
      [
        cell(a.firstName),
        cell(a.lastName),
        cell(a.email),
        // The template's own example row uses uppercase TRUE.
        "TRUE",
      ].join(",")
    );
  }

  return {
    // Trailing newline: some importers drop a final unterminated row.
    csv: `${lines.join("\n")}\n`,
    rows: pending.length,
    alreadyInBevy: present.length - pending.length,
  };
}

/**
 * Filename that identifies the event and the moment.
 *
 * Built from LOCAL time, not toISOString(). The organizer exports two or
 * three times during an event and picks the latest by eye; a UTC stamp
 * would read five hours ahead of the clock they are looking at in Ica.
 * Zero-padded so the names still sort chronologically.
 */
export function bevyCsvFilename(slug: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `-${p(now.getHours())}-${p(now.getMinutes())}`;
  return `bevy-checkin-${slug}-${stamp}.csv`;
}

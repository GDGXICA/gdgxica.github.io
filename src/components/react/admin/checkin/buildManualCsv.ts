import type { Attendee } from "./types";

const MANUAL_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "ticket_title",
  "dni",
  "how_heard",
  "checked_in",
  "checked_in_at",
] as const;

export interface ManualCsvResult {
  csv: string;
  rows: number;
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildManualAttendeesCsv(
  attendees: Attendee[]
): ManualCsvResult {
  const manual = attendees.filter((a) => a.source === "manual");
  const lines = [MANUAL_COLUMNS.join(",")];

  for (const a of manual) {
    lines.push(
      [
        escapeCell(a.firstName),
        escapeCell(a.lastName),
        escapeCell(a.email),
        escapeCell(a.ticketTitle || "General Admission"),
        escapeCell(a.dni ?? ""),
        escapeCell(a.heardAbout ?? ""),
        a.checkedIn ? "TRUE" : "FALSE",
        escapeCell(a.checkedInAt ? a.checkedInAt.toISOString() : ""),
      ].join(",")
    );
  }

  return {
    csv: `${lines.join("\n")}\n`,
    rows: manual.length,
  };
}

export function manualCsvFilename(slug: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `-${p(now.getHours())}-${p(now.getMinutes())}`;
  return `sin-bevy-${slug}-${stamp}.csv`;
}

// Parser for the registrations CSV exported from the Bevy dashboard
// (gdg.community.dev → event → Registrations → Download).
//
// This deliberately does NOT reuse parseCsv.ts from ../certificates: that
// one splits on /[,;\t]/ with no quote handling, which is fine for a
// two-column name/email list but shatters on Bevy's 21-column export the
// first time someone's Company or Title contains a comma ("Acme, Inc.").
// Its EMAIL_RE is still the right shared definition, so we reuse that.

import { EMAIL_RE } from "../certificates/parseCsv";

export interface BevyRegistration {
  ticketNumber: string;
  orderNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  ticketTitle: string;
  /** Raw "Checkin Date (UTC)" cell. Empty string means not checked in on
   *  Bevy. Kept as the original string — the import handler parses it. */
  bevyCheckinAt: string;
}

export interface ParseBevyCsvResult {
  rows: BevyRegistration[];
  /** Non-fatal problems worth showing the organizer before they import. */
  warnings: string[];
}

/**
 * Splits CSV text into rows of raw cells, per RFC 4180: double-quoted
 * fields, "" as an escaped quote, and commas/newlines inside quotes.
 */
export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Excel and some Bevy exports prepend a UTF-8 BOM, which would
  // otherwise become part of the first header name and break lookup.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        // Note: a \r or \n here is real content, not a row break.
        field += c;
        i++;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\n") {
      endRow();
      i++;
    } else if (c === "\r") {
      // Break the row here and swallow a following \n, so CRLF, LF and a
      // lone CR all behave. Treating \r as filler collapsed a CR-only file
      // (some Excel export paths still emit them) into a single row, and
      // the organizer got "faltan columnas obligatorias" — a message
      // pointing at entirely the wrong cause.
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}

const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/\s+/g, " ");

// Header aliases, matched by EXACT normalized equality. Substring
// matching would be a bug here: the export has both "Title" and "Ticket
// title", and a loose match would silently map one onto the other.
const COLUMN_ALIASES: Record<keyof BevyRegistration, string[]> = {
  ticketNumber: ["ticket number"],
  orderNumber: ["order number"],
  firstName: ["first name"],
  lastName: ["last name"],
  email: ["email"],
  company: ["company"],
  title: ["title"],
  ticketTitle: ["ticket title"],
  bevyCheckinAt: ["checkin date (utc)", "check-in date (utc)", "checkin date"],
};

// Without these we cannot build a usable roster entry.
const REQUIRED: (keyof BevyRegistration)[] = [
  "ticketNumber",
  "email",
  "firstName",
  "lastName",
];

export function parseBevyCsv(text: string): ParseBevyCsvResult {
  const table = tokenizeCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) {
    return { rows: [], warnings: ["El archivo está vacío."] };
  }

  const header = table[0].map(normalizeHeader);
  const warnings: string[] = [];

  // Resolve each field to a column index by header name, never by
  // position — Bevy is free to reorder or add columns between exports.
  const index = {} as Record<keyof BevyRegistration, number>;
  for (const key of Object.keys(COLUMN_ALIASES) as (keyof BevyRegistration)[]) {
    index[key] = header.findIndex((h) => COLUMN_ALIASES[key].includes(h));
  }

  const missing = REQUIRED.filter((k) => index[k] === -1);
  if (missing.length > 0) {
    return {
      rows: [],
      warnings: [
        `Al CSV le faltan columnas obligatorias: ${missing.join(", ")}. ` +
          `¿Es el export de registraciones de Bevy?`,
      ],
    };
  }

  const cell = (row: string[], key: keyof BevyRegistration) => {
    const i = index[key];
    return i === -1 ? "" : (row[i] ?? "").trim();
  };

  const rows: BevyRegistration[] = [];
  const seenTickets = new Set<string>();
  let skippedNoTicket = 0;
  let skippedNoEmail = 0;
  let skippedBadEmail = 0;
  let skippedNoName = 0;
  let duplicates = 0;

  for (const raw of table.slice(1)) {
    const ticketNumber = cell(raw, "ticketNumber");
    const email = cell(raw, "email");

    // The ticket number is the document ID, so a blank one is fatal for
    // that row — importing it would collide with every other blank.
    if (!ticketNumber) {
      skippedNoTicket++;
      continue;
    }
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    // The import endpoint validates emails with Zod, which rejects the
    // WHOLE request on the first bad one. Screening here turns "your
    // 300-row import failed" into "one row was skipped, here's how many".
    if (!EMAIL_RE.test(email)) {
      skippedBadEmail++;
      continue;
    }
    // REQUIRED only proves the name COLUMNS exist. A row with both name
    // cells blank imports fine, produces no name tokens, and renders as an
    // empty line that cannot be found by typing the person's surname —
    // which is the entire job of the search box. Every other skip reason
    // warns; this one used to pass silently.
    if (!cell(raw, "firstName") && !cell(raw, "lastName")) {
      skippedNoName++;
      continue;
    }
    if (seenTickets.has(ticketNumber)) {
      duplicates++;
      continue;
    }
    seenTickets.add(ticketNumber);

    rows.push({
      ticketNumber,
      orderNumber: cell(raw, "orderNumber"),
      firstName: cell(raw, "firstName"),
      lastName: cell(raw, "lastName"),
      email: email.toLowerCase(),
      company: cell(raw, "company"),
      title: cell(raw, "title"),
      ticketTitle: cell(raw, "ticketTitle"),
      bevyCheckinAt: cell(raw, "bevyCheckinAt"),
    });
  }

  if (skippedNoTicket > 0) {
    warnings.push(
      `${skippedNoTicket} fila(s) sin "Ticket number" fueron omitidas. ` +
        `Revisa el export antes de continuar.`
    );
  }
  if (skippedNoEmail > 0) {
    warnings.push(`${skippedNoEmail} fila(s) sin email fueron omitidas.`);
  }
  if (skippedBadEmail > 0) {
    warnings.push(
      `${skippedBadEmail} fila(s) con un email mal formado fueron omitidas.`
    );
  }
  if (skippedNoName > 0) {
    warnings.push(
      `${skippedNoName} fila(s) sin nombre ni apellido fueron omitidas: ` +
        `no se podría buscarlas por nombre en la puerta.`
    );
  }
  if (duplicates > 0) {
    warnings.push(`${duplicates} fila(s) con ticket repetido fueron omitidas.`);
  }
  if (index.bevyCheckinAt === -1) {
    warnings.push(
      `El CSV no trae la columna "Checkin Date (UTC)". El sync con Bevy ` +
        `no podrá saber a quién ya marcaste allá.`
    );
  }

  return { rows, warnings };
}

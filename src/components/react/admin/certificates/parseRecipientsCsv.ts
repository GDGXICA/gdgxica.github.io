import { detectDelimiter, tokenizeCsv } from "@/lib/csv";
import { isValidEmail, normalizeEmail } from "@/lib/email";

// Reads a list of people for certificates from a CSV: names, surnames and
// email, nothing else.
//
// Replaces a parser that split on any comma, semicolon or tab without
// honouring quotes, and glued every column that was not the email onto
// the name, so a Bevy export printed company and job title on the
// certificate. Columns are found by their exact header name, or, without
// a header, by which cell holds the email; anything else is ignored.

export interface PersonRow {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ParseRecipientsResult {
  rows: PersonRow[];
  /** One line per problem, naming the file line it is on. */
  warnings: string[];
}

const norm = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_]+/g, " ");

const ALIASES = {
  email: [
    "correo",
    "correo electronico",
    "email",
    "e-mail",
    "mail",
    "email address",
  ],
  firstName: ["nombres", "nombre", "first name", "firstname", "given name"],
  lastName: [
    "apellidos",
    "apellido",
    "last name",
    "lastname",
    "surname",
    "family name",
  ],
  fullName: [
    "nombre completo",
    "nombres y apellidos",
    "nombre y apellido",
    "full name",
    "name",
  ],
} as const;

type Column = keyof typeof ALIASES;

const MAX_LISTED = 8;

function headerIndex(cells: string[]): Record<Column, number> | null {
  const header = cells.map(norm);
  const find = (col: Column) =>
    header.findIndex((h) => (ALIASES[col] as readonly string[]).includes(h));
  const index = {
    email: find("email"),
    firstName: find("firstName"),
    lastName: find("lastName"),
    fullName: find("fullName"),
  };
  return index.email === -1 ? null : index;
}

export function parseRecipientsCsv(text: string): ParseRecipientsResult {
  const table = tokenizeCsv(text, detectDelimiter(text))
    .map((row, i) => ({ cells: row.map((c) => c.trim()), line: i + 1 }))
    .filter((r) => r.cells.some((c) => c !== ""));
  if (table.length === 0) {
    return { rows: [], warnings: ["El archivo está vacío."] };
  }

  const index = headerIndex(table[0].cells);
  const body = index ? table.slice(1) : table;
  if (!index && !table[0].cells.some(isValidEmail)) {
    return {
      rows: [],
      warnings: [
        "No encontré la columna de correo. Ponle de cabecera «correo» o «email», o usa un archivo donde cada fila tenga un correo.",
      ],
    };
  }

  const rows: PersonRow[] = [];
  const badEmail: string[] = [];
  const noName: number[] = [];
  const seen = new Set<string>();
  let repeated = 0;

  for (const { cells, line } of body) {
    let email: string;
    let firstName: string;
    let lastName: string;

    if (index) {
      const at = (i: number) => (i === -1 ? "" : (cells[i] ?? ""));
      email = at(index.email);
      firstName = at(index.firstName);
      lastName = at(index.lastName);
      if (!firstName && !lastName) firstName = at(index.fullName);
    } else {
      const emailAt = cells.findIndex(isValidEmail);
      email =
        emailAt === -1
          ? (cells.find((c) => c.includes("@")) ?? "")
          : cells[emailAt];
      const names = cells.filter(
        (c, i) => i !== emailAt && c !== "" && c !== email
      );
      [firstName = "", lastName = ""] = names;
    }

    if (!isValidEmail(email)) {
      badEmail.push(email ? `${line} (${email})` : `${line} (sin correo)`);
      continue;
    }
    if (!firstName && !lastName) {
      noName.push(line);
      continue;
    }
    const row = {
      firstName: firstName.replace(/\s+/g, " "),
      lastName: lastName.replace(/\s+/g, " "),
      email: normalizeEmail(email),
    };
    const key = `${row.email}|${row.firstName} ${row.lastName}`.toLowerCase();
    if (seen.has(key)) {
      repeated++;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }

  const list = (items: (string | number)[]) =>
    items.length > MAX_LISTED
      ? `${items.slice(0, MAX_LISTED).join(", ")} y ${items.length - MAX_LISTED} más`
      : items.join(", ");
  const warnings: string[] = [];
  if (badEmail.length > 0) {
    warnings.push(
      `${badEmail.length === 1 ? "Se omitió 1 fila" : `Se omitieron ${badEmail.length} filas`} por el correo, en la línea ${list(badEmail)}.`
    );
  }
  if (noName.length > 0) {
    warnings.push(
      `${noName.length === 1 ? "Se omitió 1 fila" : `Se omitieron ${noName.length} filas`} sin nombre, en la línea ${list(noName)}.`
    );
  }
  if (repeated > 0) {
    warnings.push(
      `${repeated === 1 ? "1 fila repetida se omitió" : `${repeated} filas repetidas se omitieron`}.`
    );
  }
  return { rows, warnings };
}

import { describe, expect, it } from "vitest";
import { parseBevyCsv, tokenizeCsv } from "../parseBevyCsv";

// The exact 21-column header row emitted by the Bevy dashboard export,
// verified against google-gdg-ica-presents-devfest-ica-2026.csv.
const HEADER =
  "Order number,Ticket number,First Name,Last Name,Email,Twitter,Company," +
  "Title,Featured,Ticket title,Ticket venue,Access code,Discount,Price," +
  "Currency,Number of tickets,Paid by (name),Paid by (email)," +
  "Paid date (UTC),Checkin Date (UTC),Ticket Price Paid";

// Quotes a cell the way a real CSV writer would. Several Bevy columns
// ("Paid date (UTC)" → "Jul 06, 2026 - 03:10 PM", and "Price" → "0,00" in
// an ES locale) contain commas, so a fixture that naively joins on ","
// produces a shifted, invalid file.
const cell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const row = (over: Partial<Record<string, string>> = {}) => {
  const c = {
    order: "ORD-1",
    ticket: "GOOGA263171317",
    first: "Alex Alberto",
    last: "Quintanilla Garcia",
    email: "wcandry@gmail.com",
    company: "",
    title: "",
    ticketTitle: "General Admission",
    checkin: "",
    ...over,
  };
  return [
    c.order,
    c.ticket,
    c.first,
    c.last,
    c.email,
    "", // Twitter
    c.company,
    c.title,
    "", // Featured
    c.ticketTitle,
    "In-person",
    "", // Access code
    "", // Discount
    "0,00", // Price, ES locale — contains a comma
    "USD",
    "1",
    "",
    "",
    "Jul 06, 2026 - 03:10 PM", // also contains a comma
    c.checkin,
    "0.00",
  ]
    .map(cell)
    .join(",");
};

describe("tokenizeCsv — RFC 4180 behaviour", () => {
  it("keeps commas that live inside quoted fields", () => {
    const out = tokenizeCsv('a,"Acme, Inc.",c');
    expect(out).toEqual([["a", "Acme, Inc.", "c"]]);
  });

  it("unescapes doubled quotes", () => {
    const out = tokenizeCsv('a,"She said ""hi""",c');
    expect(out).toEqual([["a", 'She said "hi"', "c"]]);
  });

  it("keeps newlines inside quoted fields as content, not row breaks", () => {
    const out = tokenizeCsv('a,"line one\nline two",c\nd,e,f');
    expect(out).toEqual([
      ["a", "line one\nline two", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(tokenizeCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips a UTF-8 BOM so the first header name stays clean", () => {
    expect(tokenizeCsv("﻿Order number,Email")).toEqual([
      ["Order number", "Email"],
    ]);
  });

  it("preserves empty trailing fields", () => {
    expect(tokenizeCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("parseBevyCsv — the real export shape", () => {
  it("maps every field from a well-formed row", () => {
    const { rows, warnings } = parseBevyCsv([HEADER, row()].join("\n"));
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      {
        ticketNumber: "GOOGA263171317",
        orderNumber: "ORD-1",
        firstName: "Alex Alberto",
        lastName: "Quintanilla Garcia",
        email: "wcandry@gmail.com",
        company: "",
        title: "",
        ticketTitle: "General Admission",
        bevyCheckinAt: "",
      },
    ]);
  });

  it("lowercases the email so re-imports match regardless of casing", () => {
    const { rows } = parseBevyCsv(
      [HEADER, row({ email: "Alex.QUINTANILLA@Gmail.com" })].join("\n")
    );
    expect(rows[0].email).toBe("alex.quintanilla@gmail.com");
  });

  it("preserves diacritics in names", () => {
    const { rows } = parseBevyCsv(
      [HEADER, row({ first: "María", last: "Ñañez Solís" })].join("\n")
    );
    expect(rows[0].firstName).toBe("María");
    expect(rows[0].lastName).toBe("Ñañez Solís");
  });

  it("carries the Bevy check-in date through when present", () => {
    const { rows } = parseBevyCsv(
      [HEADER, row({ checkin: "Jul 18, 2026 - 09:15 AM" })].join("\n")
    );
    expect(rows[0].bevyCheckinAt).toBe("Jul 18, 2026 - 09:15 AM");
  });
});

// This is the whole reason parseCsv.ts could not be reused.
describe("parseBevyCsv — comma inside a quoted field", () => {
  it("does not shift columns when Company contains a comma", () => {
    const raw = [HEADER, row({ company: "Acme, Inc.", title: "Dev" })].join(
      "\n"
    );
    const { rows } = parseBevyCsv(raw);
    expect(rows[0].company).toBe("Acme, Inc.");
    // The real assertion: everything after the comma still lines up.
    expect(rows[0].title).toBe("Dev");
    expect(rows[0].ticketTitle).toBe("General Admission");
    expect(rows[0].email).toBe("wcandry@gmail.com");
  });
});

describe("parseBevyCsv — header-name mapping", () => {
  it("tolerates reordered columns", () => {
    const raw = [
      "Email,Ticket number,Last Name,First Name",
      "ana@x.com,TKT-9,Lopez,Ana",
    ].join("\n");
    const { rows } = parseBevyCsv(raw);
    expect(rows[0]).toMatchObject({
      email: "ana@x.com",
      ticketNumber: "TKT-9",
      firstName: "Ana",
      lastName: "Lopez",
    });
  });

  it("does not confuse 'Title' with 'Ticket title'", () => {
    const raw = [
      "Ticket number,First Name,Last Name,Email,Title,Ticket title",
      "TKT-9,Ana,Lopez,ana@x.com,Engineer,VIP",
    ].join("\n");
    const { rows } = parseBevyCsv(raw);
    expect(rows[0].title).toBe("Engineer");
    expect(rows[0].ticketTitle).toBe("VIP");
  });

  it("is case- and spacing-insensitive on header names", () => {
    const raw = [
      "  TICKET NUMBER ,First   Name,Last Name,EMAIL",
      "TKT-9,Ana,Lopez,ana@x.com",
    ].join("\n");
    const { rows } = parseBevyCsv(raw);
    expect(rows[0].ticketNumber).toBe("TKT-9");
    expect(rows[0].firstName).toBe("Ana");
  });

  it("refuses the file when required columns are absent", () => {
    const { rows, warnings } = parseBevyCsv("Name,Email\nAna,ana@x.com");
    expect(rows).toEqual([]);
    expect(warnings[0]).toContain("columnas obligatorias");
  });

  it("warns when the check-in column is missing but still imports", () => {
    const raw = [
      "Ticket number,First Name,Last Name,Email",
      "TKT-9,Ana,Lopez,ana@x.com",
    ].join("\n");
    const { rows, warnings } = parseBevyCsv(raw);
    expect(rows).toHaveLength(1);
    expect(warnings.join(" ")).toContain("Checkin Date");
  });
});

describe("parseBevyCsv — row-level validation", () => {
  it("skips and reports rows with a blank ticket number", () => {
    const raw = [HEADER, row(), row({ ticket: "" })].join("\n");
    const { rows, warnings } = parseBevyCsv(raw);
    expect(rows).toHaveLength(1);
    expect(warnings.join(" ")).toContain("Ticket number");
  });

  it("skips and reports rows with no email", () => {
    const raw = [HEADER, row(), row({ ticket: "TKT-2", email: "" })].join("\n");
    const { rows, warnings } = parseBevyCsv(raw);
    expect(rows).toHaveLength(1);
    expect(warnings.join(" ")).toContain("sin email");
  });

  it("keeps the first occurrence of a duplicated ticket number", () => {
    const raw = [
      HEADER,
      row({ email: "first@x.com" }),
      row({ email: "second@x.com" }),
    ].join("\n");
    const { rows, warnings } = parseBevyCsv(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("first@x.com");
    expect(warnings.join(" ")).toContain("ticket repetido");
  });

  it("skips blank lines, including a trailing newline", () => {
    const raw = [HEADER, row(), "", row({ ticket: "TKT-2" }), ""].join("\n");
    expect(parseBevyCsv(raw).rows).toHaveLength(2);
  });

  it("returns a warning for an empty file", () => {
    expect(parseBevyCsv("").rows).toEqual([]);
    expect(parseBevyCsv("").warnings[0]).toContain("vacío");
  });

  it("returns no rows when only a header is present", () => {
    expect(parseBevyCsv(HEADER).rows).toEqual([]);
  });
});

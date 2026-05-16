import { readFile } from "fs/promises";
import { join } from "path";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// The blank certificate template (header, GDG logo, "Este documento
// certifica que", signature + signatory, decorations). The recipient
// name and the certifying paragraph are drawn on top at runtime — the
// template MUST NOT contain them. Lives in functions/assets so it ships
// with the deployed function source.
const TEMPLATE_PATH = join(
  __dirname,
  "..",
  "..",
  "assets",
  "certificate-template.pdf"
);

// All tunable layout numbers in one place. Coordinates are PDF points
// with the origin at the bottom-left (pdf-lib convention). The template
// page is 1584 x 1224 pt; "Este documento certifica que" sits at the
// left margin x=90.34 and the signature block starts ~y=250, so the
// name + paragraph live in the band between them.
const LAYOUT = {
  marginLeft: 90,
  // Right edge where paragraph text wraps (decorations start ~x=720).
  wrapRight: 715,
  name: {
    size: 44,
    baselineY: 690,
    color: rgb(1, 1, 1),
    // Vivid cyan highlight box behind the name (matches the design).
    highlight: rgb(0.122, 0.71, 0.929),
    padX: 10,
    padTop: 14,
    padBottom: 12,
  },
  paragraph: {
    size: 26,
    lineHeight: 39,
    firstBaselineY: 590,
    color: rgb(0.92, 0.94, 0.96),
  },
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export interface CertificateInput {
  recipientName: string;
  eventName: string;
  startTime: string;
  endTime: string;
  hours: number;
  /** ISO date `YYYY-MM-DD` of the event. */
  eventDate: string;
  /** Defaults to "GDG ICA". */
  organizer?: string;
}

/** "2026-04-18" -> "18 de abril de 2026". Falls back to the raw string. */
function formatSpanishDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11) return iso;
  return `${day} de ${MONTHS_ES[month]} de ${year}`;
}

// pdf-lib's standard fonts encode WinAnsi (CP1252), which covers Spanish
// (á é í ó ú ñ ¿ ¡) and common typographic punctuation. Normalize a few
// characters that text pasted from docs may contain but CP1252 lacks,
// then drop anything still outside the byte range so a stray emoji in an
// event name can never crash generation.
function sanitize(text: string): string {
  const normalized = text
    .normalize("NFC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ");
  let out = "";
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || (code >= 32 && code <= 255)) out += ch;
  }
  return out.trim();
}

interface Run {
  text: string;
  bold: boolean;
}

interface Token {
  text: string;
  bold: boolean;
}

// Greedy word-wrap across mixed bold/regular runs. Returns lines, each a
// list of tokens carrying their own font weight, so the renderer can
// draw a single paragraph where only some words are bold.
function layoutRuns(
  runs: Run[],
  regular: PDFFont,
  bold: PDFFont,
  size: number,
  maxWidth: number
): Token[][] {
  const tokens: Token[] = [];
  for (const run of runs) {
    const parts = run.text.split(/\s+/).filter(Boolean);
    for (const p of parts) tokens.push({ text: p, bold: run.bold });
  }

  const widthOf = (t: Token) =>
    (t.bold ? bold : regular).widthOfTextAtSize(t.text, size);
  const spaceW = regular.widthOfTextAtSize(" ", size);

  const lines: Token[][] = [];
  let line: Token[] = [];
  let lineW = 0;
  for (const tok of tokens) {
    const w = widthOf(tok);
    const add = line.length === 0 ? w : spaceW + w;
    if (line.length > 0 && lineW + add > maxWidth) {
      lines.push(line);
      line = [tok];
      lineW = w;
    } else {
      line.push(tok);
      lineW += add;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function drawParagraph(
  page: PDFPage,
  lines: Token[][],
  regular: PDFFont,
  bold: PDFFont
) {
  const { size, lineHeight, firstBaselineY, color } = LAYOUT.paragraph;
  const spaceW = regular.widthOfTextAtSize(" ", size);
  lines.forEach((line, i) => {
    let x = LAYOUT.marginLeft;
    const y = firstBaselineY - i * lineHeight;
    line.forEach((tok, j) => {
      const font = tok.bold ? bold : regular;
      page.drawText(tok.text, { x, y, size, font, color });
      x += font.widthOfTextAtSize(tok.text, size);
      if (j < line.length - 1) x += spaceW;
    });
  });
}

/**
 * Generates the certificate PDF in memory from the bundled template.
 * Nothing is persisted — the caller attaches the returned bytes to an
 * email and discards them.
 */
export async function buildCertificatePdf(
  input: CertificateInput
): Promise<Uint8Array> {
  const templateBytes = await readFile(TEMPLATE_PATH);
  const doc = await PDFDocument.load(templateBytes);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.getPages()[0];

  const name = sanitize(input.recipientName);
  const organizer = sanitize(input.organizer || "GDG ICA");
  const eventName = sanitize(input.eventName);
  const startTime = sanitize(input.startTime);
  const endTime = sanitize(input.endTime);
  const dateStr = formatSpanishDate(input.eventDate);
  const hoursLabel = `${input.hours} ${input.hours === 1 ? "hora" : "horas"}`;

  // Name with cyan highlight box.
  const n = LAYOUT.name;
  const nameWidth = bold.widthOfTextAtSize(name, n.size);
  page.drawRectangle({
    x: LAYOUT.marginLeft - n.padX,
    y: n.baselineY - n.padBottom,
    width: nameWidth + n.padX * 2,
    height: n.size + n.padTop,
    color: n.highlight,
  });
  page.drawText(name, {
    x: LAYOUT.marginLeft,
    y: n.baselineY,
    size: n.size,
    font: bold,
    color: n.color,
  });

  // Certifying paragraph — static copy with the dynamic values bolded,
  // mirroring the original certificate wording.
  const runs: Run[] = [
    { text: "ha participado y contribuido exitosamente en ", bold: false },
    { text: eventName, bold: true },
    { text: ", el cual tuvo lugar de ", bold: false },
    { text: `${startTime} a ${endTime}`, bold: true },
    { text: ", completando un total de ", bold: false },
    { text: hoursLabel, bold: true },
    { text: " de desarrollo profesional, organizado por ", bold: false },
    { text: organizer, bold: true },
    { text: " el ", bold: false },
    { text: `${dateStr}.`, bold: true },
  ];
  const maxWidth = LAYOUT.wrapRight - LAYOUT.marginLeft;
  const lines = layoutRuns(
    runs,
    regular,
    bold,
    LAYOUT.paragraph.size,
    maxWidth
  );
  drawParagraph(page, lines, regular, bold);

  return doc.save();
}

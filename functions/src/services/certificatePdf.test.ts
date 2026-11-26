import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import { PDFDocument, PDFFont } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CERTIFICATE_KINDS,
  buildCertificatePdf,
  formatHours,
  layoutName,
  layoutRuns,
  paragraphRuns,
  type CertificateInput,
} from "./certificatePdf";
import layout from "./certificateLayout.json";

// Set CERT_PREVIEW_DIR to keep the generated PDFs and look at them.
const PREVIEW_DIR = process.env.CERT_PREVIEW_DIR;

const BASE: Omit<CertificateInput, "kind" | "recipientName"> = {
  eventName: "DevFest Ica 2026",
  startTime: "9:00 a.m.",
  endTime: "6:00 p.m.",
  hours: 9,
  eventDate: "2026-11-21",
};

const FONTS = join(__dirname, "..", "..", "assets", "fonts");
let nameFont: PDFFont;
let regular: PDFFont;
let bold: PDFFont;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  nameFont = await doc.embedFont(
    await readFile(join(FONTS, "BodoniModa-MediumItalic.ttf"))
  );
  regular = await doc.embedFont(
    await readFile(join(FONTS, "Geist-Regular.ttf"))
  );
  bold = await doc.embedFont(await readFile(join(FONTS, "Geist-Medium.ttf")));
});

describe("buildCertificatePdf", () => {
  it.each(CERTIFICATE_KINDS)(
    "generates a one-page A4 landscape PDF for %s",
    async (kind) => {
      const bytes = await buildCertificatePdf({
        ...BASE,
        kind,
        recipientName: "María José Ñahui Quispe",
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBeCloseTo(layout.page.width, 0);
      expect(height).toBeCloseTo(layout.page.height, 0);
      expect(doc.getTitle()).toBe("Certificado · María José Ñahui Quispe");

      if (PREVIEW_DIR) {
        mkdirSync(PREVIEW_DIR, { recursive: true });
        writeFileSync(join(PREVIEW_DIR, `${kind}.pdf`), bytes);
      }
    }
  );

  it("survives emoji and stray control characters in user input", async () => {
    const bytes = await buildCertificatePdf({
      ...BASE,
      kind: "attendee",
      recipientName: "Ana 🚀 Torres\u200B",
      eventName: "Build with AI — “Gemini” 🤖 Ica",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("keeps a very long name and event inside the page", async () => {
    const bytes = await buildCertificatePdf({
      ...BASE,
      kind: "speaker",
      recipientName:
        "Maximiliano Alejandro de la Cruz Villavicencio Huamaní Echegaray",
      eventName:
        "Taller intensivo: prepárate para certificarte en Google Cloud con laboratorios guiados, mentorías y simulacros de examen",
    });
    if (PREVIEW_DIR) writeFileSync(join(PREVIEW_DIR, "long.pdf"), bytes);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("layoutName", () => {
  it("keeps common names on one line at display size", () => {
    expect(layoutName(nameFont, "Ana Ruiz").size).toBe(layout.name.maxSize);
    const l = layoutName(nameFont, "Eduardo Ormeño Meneses");
    expect(l.lines).toHaveLength(1);
    expect(l.size).toBeGreaterThanOrEqual(34);
  });

  it("never lets a line exceed the text column", () => {
    for (const name of [
      "Ana",
      "Maximiliano Alejandro de la Cruz Villavicencio Huamaní Echegaray",
      "A".repeat(120),
      `${"Nombre ".repeat(17)}Final`,
    ]) {
      const l = layoutName(nameFont, name);
      for (const line of l.lines) {
        expect(
          nameFont.widthOfTextAtSize(line.text, l.size)
        ).toBeLessThanOrEqual(layout.column.width);
      }
    }
  });

  it("breaks into two lines before shrinking below the minimum", () => {
    const l = layoutName(
      nameFont,
      "Maximiliano Alejandro de la Cruz Villavicencio Huamaní Echegaray"
    );
    expect(l.lines).toHaveLength(2);
    expect(l.lines.map((x) => x.baselineY)).toEqual(
      layout.name.twoLineBaselinesY
    );
  });
});

describe("paragraph", () => {
  const values = {
    eventName: "DevFest Ica 2026",
    organizer: "GDG ICA",
    date: "21 de noviembre de 2026",
    startTime: "9:00 a.m.",
    endTime: "6:00 p.m.",
    hours: "9 horas",
  };

  it("uses different wording per kind", () => {
    const text = (k: (typeof CERTIFICATE_KINDS)[number]) =>
      paragraphRuns(k, values)
        .map((r) => r.text)
        .join("");
    expect(text("attendee")).toContain("como asistente en DevFest Ica 2026");
    expect(text("volunteer")).toContain("equipo de voluntariado de DevFest");
    expect(text("speaker")).toContain("como speaker en DevFest Ica 2026");
    expect(text("speaker")).not.toContain("9 horas");
  });

  it("glues punctuation to the bold value before it, never to the next line", () => {
    const lines = layoutRuns(
      paragraphRuns("attendee", values),
      regular,
      bold,
      layout.paragraph.size,
      layout.paragraph.width
    );
    const flat = lines.flat();
    const comma = flat.find((t) => t.text === ",organizado" || t.text === ",");
    expect(comma).toBeDefined();
    expect(comma?.glued).toBe(true);
    for (const line of lines) expect(line[0].text.startsWith(",")).toBe(false);
  });

  it("never wraps a time or the date in the middle", () => {
    const runs = paragraphRuns("speaker", values);
    for (let width = 160; width <= layout.paragraph.width; width += 7) {
      const lines = layoutRuns(
        runs,
        regular,
        bold,
        layout.paragraph.size,
        width
      );
      for (const line of lines) {
        expect(line[0].text).not.toMatch(/^(a|p)\.m\./);
      }
      // The whole date is one token, so no width can split it.
      expect(
        lines
          .flat()
          .some((t) => t.text === "21\u00A0de\u00A0noviembre\u00A0de\u00A02026")
      ).toBe(true);
    }
  });

  it("formats hours in Spanish", () => {
    expect(formatHours(1)).toBe("1 hora");
    expect(formatHours(4)).toBe("4 horas");
    expect(formatHours(2.5)).toBe("2,5 horas");
  });
});

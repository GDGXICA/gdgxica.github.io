#!/usr/bin/env node
// Regenerates the static layer of the three certificate templates:
//   functions/assets/certificates/{attendee,volunteer,speaker}.pdf
//
// Everything that is the same for every recipient (frame, colibrí, GDG
// lockup, title, signature, seal) is drawn here as one SVG page and
// printed to PDF by headless Chromium, which embeds the fonts and keeps
// every line vector. The recipient's name and the certifying paragraph
// are NOT part of the template: certificatePdf.ts draws them at runtime
// in the band this file leaves empty. Both read the same coordinates
// from src/services/certificateLayout.json (y measured from the TOP).
//
// Usage (from functions/):
//   node scripts/certificates/build-templates.mjs
// Needs a Chromium binary: set CHROME_BIN, or have Playwright's
// chromium-headless-shell in ~/.cache/ms-playwright.

import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = join(here, "..", "..");
const fontsDir = join(functionsDir, "assets", "fonts");
const outDir = join(functionsDir, "assets", "certificates");
const L = JSON.parse(
  readFileSync(
    join(functionsDir, "src", "services", "certificateLayout.json"),
    "utf8"
  )
);

const W = L.page.width;
const H = L.page.height;
const C = L.colors;
const COL_X = L.column.x;
const COL_R = L.column.x + L.column.width;

// What changes between the three certificates. The certifying paragraph
// lives in certificatePdf.ts because it carries per-recipient data.
const KINDS = {
  attendee: { phrase: "de Participación", seal: "ASISTENTE" },
  volunteer: { phrase: "de Voluntariado", seal: "VOLUNTARIADO" },
  speaker: { phrase: "de Reconocimiento", seal: "SPEAKER" },
};

// Colibrí: the page's background, seen from above like the geoglyph on
// the pampa. Large enough to run under the text column and off the frame;
// its line fades from right to left (see BIRD_FADE) so it is present
// where the page is empty and recedes behind the name and paragraph.
// 4.2pt is under the reference weight (1.3 of 100 units ≈ 7pt at this
// size): the hairpin feathers need the air.
const BIRD = { cx: 650, cy: 300, height: 560, strokePt: 4.2 };
// Stroke opacity across the bird's width, left edge to right edge.
const BIRD_FADE = [
  [0, 0.05],
  [0.45, 0.11],
  [1, 0.4],
];
// Seal at the bottom-right of the text column.
const SEAL = { cx: COL_R - 46, cy: 478 };

const f = (n) => Number(n.toFixed(2));

function svgInner(file) {
  const raw = readFileSync(join(here, file), "utf8");
  return raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

const COLIBRI = (() => {
  const raw = readFileSync(join(here, "colibri.svg"), "utf8");
  const [x, y, w, h] = raw
    .match(/viewBox="([^"]+)"/)[1]
    .split(/\s+/)
    .map(Number);
  return { d: raw.match(/ d="([^"]+)"/)[1], x, y, w, h, stroke: 1.3 };
})();

// The chapter's colibrí centred on (cx, cy) at `height` points tall, at its
// reference line weight unless `strokePt` overrides it. `stroke` is any
// SVG paint (a colour or a url(#gradient)).
function colibri(cx, cy, height, strokePt, stroke = C.gold) {
  const s = height / COLIBRI.h;
  const tx = cx - (COLIBRI.x + COLIBRI.w / 2) * s;
  const ty = cy - (COLIBRI.y + COLIBRI.h / 2) * s;
  const sw = strokePt ? strokePt / s : COLIBRI.stroke;
  return `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(s)})">
    <path d="${COLIBRI.d}" fill="none" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linejoin="round" stroke-linecap="round"/>
  </g>`;
}

// --- Frame: a survey-map neatline, two rules with an alternating gold
// band between them, the way printed charts mark their graticule.
function frame() {
  const o = 20;
  const i = 24;
  const band = i - o;
  const parts = [
    `<rect x="${o}" y="${o}" width="${f(W - 2 * o)}" height="${f(H - 2 * o)}" fill="none" stroke="${C.gold}" stroke-width="0.7"/>`,
    `<rect x="${i}" y="${i}" width="${f(W - 2 * i)}" height="${f(H - 2 * i)}" fill="none" stroke="${C.gold}" stroke-width="0.4"/>`,
  ];
  const run = (len) => {
    const n = Math.max(1, Math.round(len / 28.35));
    return { n, seg: len / n };
  };
  const h = run(W - 2 * i);
  for (let k = 0; k < h.n; k += 2) {
    const x = f(i + k * h.seg);
    parts.push(
      `<rect x="${x}" y="${o}" width="${f(h.seg)}" height="${band}" fill="${C.gold}"/>`,
      `<rect x="${x}" y="${f(H - i)}" width="${f(h.seg)}" height="${band}" fill="${C.gold}"/>`
    );
  }
  const v = run(H - 2 * i);
  for (let k = 0; k < v.n; k += 2) {
    const y = f(i + k * v.seg);
    parts.push(
      `<rect x="${o}" y="${y}" width="${band}" height="${f(v.seg)}" fill="${C.gold}"/>`,
      `<rect x="${f(W - i)}" y="${y}" width="${band}" height="${f(v.seg)}" fill="${C.gold}"/>`
    );
  }
  for (const [x, y] of [
    [o, o],
    [W - i, o],
    [o, H - i],
    [W - i, H - i],
  ]) {
    parts.push(
      `<rect x="${f(x)}" y="${f(y)}" width="${band}" height="${band}" fill="${C.gold}"/>`
    );
  }
  return parts.join("\n");
}

// --- Background: the chapter's colibrí as one gold line across the
// pampa, clipped to the inner frame, fading out under the text.
function pampa() {
  const stops = BIRD_FADE.map(
    ([o, a]) =>
      `<stop offset="${o}" stop-color="${C.gold}" stop-opacity="${a}"/>`
  ).join("");
  return `
  <defs><linearGradient id="bird-fade" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
  <g clip-path="url(#inner)">
    ${colibri(BIRD.cx, BIRD.cy, BIRD.height, BIRD.strokePt, "url(#bird-fade)")}
  </g>`;
}

function lockup() {
  const h = 26;
  const s = h / 41;
  const x = COL_X;
  const y = 52;
  const tx = x + 85 * s + 11;
  return `
  <g transform="translate(${x} ${y}) scale(${f(s)})">${svgInner("gdg-logo.svg").replace(/<title>[\s\S]*?<\/title>/, "")}</g>
  <text x="${f(tx)}" y="${y + 12}" font-family="Geist" font-weight="500" font-size="12" fill="${C.ivory}">Google Developer Groups</text>
  <text x="${f(tx)}" y="${y + 25.5}" font-family="Geist" font-weight="600" font-size="8" letter-spacing="1.6" fill="${C.gold}">GDG ICA</text>`;
}

// --- Title block. One Didone voice from title to name: the title is a
// single roman + italic line, small enough that the recipient's name
// (48pt, drawn at runtime) leads; "Se otorga a" is set in the same italic
// as the name and sits close to it, so it reads as the start of the
// dedication instead of a stray label. 34pt keeps the longest title
// ("Certificado de Reconocimiento", 13.57em ≈ 461pt) inside the column.
// The rule under the name ends in two ticks, like a survey scale bar.
function title(kind) {
  const y = L.rule.y;
  return `
  <text x="${COL_X - 1}" y="150" font-family="Bodoni" font-size="34" letter-spacing="-0.2" fill="${C.ivory}">Certificado <tspan font-family="BodoniItalic" letter-spacing="0">${KINDS[kind].phrase}</tspan></text>
  <text x="${COL_X}" y="208" font-family="BodoniItalic" font-size="15" fill="${C.ivoryDim}">Se otorga a</text>
  <g stroke="${C.gold}" stroke-width="0.6" stroke-linecap="square">
    <line x1="${COL_X}" y1="${y}" x2="${COL_R}" y2="${y}"/>
    <line x1="${COL_X}" y1="${y - 4}" x2="${COL_X}" y2="${y}"/>
    <line x1="${COL_R}" y1="${y - 4}" x2="${COL_R}" y2="${y}"/>
  </g>`;
}

function signature() {
  const w = 118;
  const h = (w * 1137) / 1977;
  const lineY = 494;
  return `
  <g transform="translate(${COL_X - 6} ${f(lineY - h + 4)}) scale(${f(w / 1977)})" color="${C.ivory}">${svgInner("signature-eduardo.svg").replace(/<!--[\s\S]*?-->/g, "")}</g>
  <line x1="${COL_X}" y1="${lineY}" x2="${COL_X + 186}" y2="${lineY}" stroke="${C.ivoryDim}" stroke-width="0.5"/>
  <text x="${COL_X}" y="${lineY + 16}" font-family="Geist" font-weight="500" font-size="10" fill="${C.ivory}">Eduardo Ormeño Meneses</text>
  <text x="${COL_X}" y="${lineY + 29}" font-family="Geist" font-size="8.5" fill="${C.gold}">Organizador · GDG ICA</text>`;
}

// --- Seal: two rings, the ROLE over the top at a size that survives an
// email preview (it is what tells the three certificates apart), the
// chapter along the bottom, the colibrí in the middle. Text runs on
// full circles so the top line reads upright clockwise and the bottom
// one counter-clockwise; both sit in the band between r=29.5 and 42.5.
function seal(kind) {
  const { cx, cy } = SEAL;
  const top = { text: KINDS[kind].seal, size: 8.6, track: 1.7 };
  const bot = { text: "GDG ICA", size: 6.4, track: 1.8 };
  const rTop = 33;
  const rBot = rTop + bot.size * 0.7;
  const circle = (r, sweep) =>
    `M ${cx} ${f(cy + (sweep ? r : -r))} A ${r} ${r} 0 1 ${sweep} ${cx} ${f(cy - (sweep ? r : -r))} A ${r} ${r} 0 1 ${sweep} ${cx} ${f(cy + (sweep ? r : -r))}`;
  // Estimated advance per capital (Geist caps ≈ 0.66em) to place the two
  // separator dots in the middle of the gaps between the texts.
  const span = (t, r) =>
    ((t.text.length * (t.size * 0.66 + t.track)) / r) * (180 / Math.PI);
  const topSpan = span(top, rTop);
  const botSpan = span(bot, rBot);
  const topEnds = [270 - topSpan / 2, 270 + topSpan / 2];
  const botEnds = [90 - botSpan / 2, 90 + botSpan / 2];
  const gapR = (topEnds[1] - 360 + botEnds[0]) / 2;
  const gapL = (botEnds[1] + topEnds[0]) / 2;
  const dot = (deg) => {
    const a = (deg * Math.PI) / 180;
    const r = rTop + 2.5;
    return `<circle cx="${f(cx + r * Math.cos(a))}" cy="${f(cy + r * Math.sin(a))}" r="1.2" fill="${C.gold}"/>`;
  };
  const textOn = (id, t) =>
    `<text font-size="${t.size}" letter-spacing="${t.track}"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${t.text}</textPath></text>`;
  return `
  <defs>
    <path id="seal-top" d="${circle(rTop, 1)}"/>
    <path id="seal-bot" d="${circle(rBot, 0)}"/>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="46" fill="${C.ground}"/>
  <g fill="none" stroke="${C.gold}">
    <circle cx="${cx}" cy="${cy}" r="46" stroke-width="0.9"/>
    <circle cx="${cx}" cy="${cy}" r="42.5" stroke-width="0.35"/>
    <circle cx="${cx}" cy="${cy}" r="29.5" stroke-width="0.35"/>
  </g>
  <g font-family="Geist" font-weight="600" fill="${C.gold}">
    ${textOn("seal-top", top)}
    ${textOn("seal-bot", bot)}
  </g>
  ${dot(gapR)}${dot(gapL)}
  ${colibri(cx, cy, 42, 0.45)}`;
}

function fontFaces() {
  const face = (family, file, weight = 400) =>
    `@font-face{font-family:"${family}";src:url("${pathToFileURL(join(fontsDir, file)).href}") format("truetype");font-weight:${weight};font-style:normal}`;
  return [
    face("Bodoni", "BodoniModa-Medium.ttf"),
    face("BodoniItalic", "BodoniModa-MediumItalic.ttf"),
    face("Geist", "Geist-Regular.ttf", 400),
    face("Geist", "Geist-Medium.ttf", 500),
    face("Geist", "Geist-SemiBold.ttf", 600),
  ].join("\n");
}

function page(kind) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="297mm" height="210mm">
  <defs><clipPath id="inner"><rect x="24" y="24" width="${f(W - 48)}" height="${f(H - 48)}"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="${C.ground}"/>
  ${frame()}
  ${pampa()}
  ${lockup()}
  ${title(kind)}
  ${signature()}
  ${seal(kind)}
</svg>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Certificado · GDG ICA</title>
<style>
${fontFaces()}
@page { size: 297mm 210mm; margin: 0 }
html, body { margin: 0; padding: 0; width: 297mm; height: 210mm; overflow: hidden; background: ${C.ground}; print-color-adjust: exact; -webkit-print-color-adjust: exact }
svg { display: block }
</style></head><body>${svg}</body></html>`;
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const base = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(base)) {
    const shells = readdirSync(base)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();
    for (const d of shells) {
      const bin = join(
        base,
        d,
        "chrome-headless-shell-linux64",
        "chrome-headless-shell"
      );
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error(
    "No Chromium found. Set CHROME_BIN to a chrome/chromium binary."
  );
}

async function main() {
  const chrome = findChrome();
  const only = process.argv.slice(2);
  const kinds = only.length ? only : Object.keys(KINDS);
  const tmp = mkdtempSync(join(tmpdir(), "gdg-cert-"));
  const require = createRequire(join(functionsDir, "package.json"));
  const { PDFDocument } = require("pdf-lib");
  try {
    for (const kind of kinds) {
      if (!KINDS[kind]) throw new Error(`Unknown kind: ${kind}`);
      const html = join(tmp, `${kind}.html`);
      writeFileSync(html, page(kind));
      if (process.env.KEEP_HTML)
        writeFileSync(join(outDir, `${kind}.html`), page(kind));
      const out = join(outDir, `${kind}.pdf`);
      execFileSync(
        chrome,
        [
          "--headless",
          "--disable-gpu",
          "--no-pdf-header-footer",
          "--run-all-compositor-stages-before-draw",
          "--virtual-time-budget=3000",
          `--print-to-pdf=${out}`,
          pathToFileURL(html).href,
        ],
        { stdio: "pipe" }
      );
      const doc = await PDFDocument.load(readFileSync(out));
      const pages = doc.getPages();
      const { width, height } = pages[0].getSize();
      if (
        pages.length !== 1 ||
        Math.abs(width - W) > 1 ||
        Math.abs(height - H) > 1
      ) {
        throw new Error(
          `${kind}: expected 1 page of ${W}x${H}, got ${pages.length} of ${width}x${height}`
        );
      }
      process.stdout.write(`wrote ${out}\n`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});

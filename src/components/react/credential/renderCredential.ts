// Pure canvas renderer for the attendee credential.
//
// Mirrors how functions/src/services/certificatePdf.ts isolates its LAYOUT
// constant: every tunable number lives in one object, and the draw function
// itself is synchronous, touches no DOM beyond the context it is handed,
// and takes images ALREADY DECODED. That is what makes it unit-testable in
// jsdom against a recording mock context — the repo ships no canvas
// polyfill, so the tests assert the call sequence and the computed
// coordinates rather than pixels. Pinning the layout math is the useful
// level; pinning the rasterizer is not.

/** Google's four brand colors, as defined in src/styles/global.css. */
export const BRAND_COLORS = ["#2463eb", "#ef4444", "#ebb308", "#16a34a"];

export const CREDENTIAL_LAYOUT = {
  // 4:5 portrait — the tallest aspect Instagram and LinkedIn render
  // without cropping, so a shared credential is never cut off.
  width: 1080,
  height: 1350,
  background: "#f3f6fb",
  fontFamily: "'Geist Variable', sans-serif",

  headline: {
    x: 82,
    y: 142,
    size: 34,
    maxWidth: 700,
    color: "#4b5563",
  },
  eventName: {
    x: 82,
    y: 214,
    sizes: [60, 54, 48, 40],
    maxWidth: 780,
    color: "#111827",
  },
  // Decorative corner arcs in the brand colors.
  corner: {
    cx: 1048,
    cy: 32,
    radii: [260, 202, 144, 86],
    lineWidth: 22,
  },
  avatar: {
    cx: 540,
    cy: 535,
    r: 172,
    ringWidth: 14,
    // Gap between ring segments, in radians.
    ringGap: 0.06,
  },
  name: {
    x: 540,
    y: 800,
    sizes: [72, 62, 52, 44],
    maxWidth: 900,
    color: "#111827",
  },
  handle: {
    x: 540,
    y: 858,
    size: 32,
    color: "#4b5563",
  },
  group: {
    cx: 148,
    cy: 1112,
    r: 66,
    size: 58,
    label: { y: 1204, size: 19, color: "#71717a" },
  },
  eventDate: {
    x: 268,
    y: 1090,
    // 30px over 560 fits a full Spanish long date ("sabado, 21 de
    // noviembre de 2026") without ellipsis; at 32/480 it lost the year.
    size: 30,
    color: "#111827",
    maxWidth: 560,
  },
  cta: {
    x: 268,
    y: 1143,
    size: 25,
    color: "#4b5563",
    maxWidth: 560,
  },
  qr: {
    x: 852,
    y: 1038,
    size: 156,
    quietZone: 10,
  },
  brandBar: {
    y: 1326,
    height: 24,
  },
} as const;

export type CredentialLayout = typeof CREDENTIAL_LAYOUT;

export interface CredentialRenderInput {
  headline: string;
  eventName: string;
  eventDateLabel: string;
  firstName: string;
  lastName: string;
  githubUsername: string | null;
  groupLetter: string;
  /** Already decoded. Null renders the initials fallback instead. */
  avatar: CanvasImageSource | null;
  /** Already decoded QR of the official registration URL. */
  qrImage: CanvasImageSource | null;
  ctaLabel: string;
}

// Pure helpers ---------------------------------------------------------

/**
 * Source rectangle that fills a destination box without distortion,
 * cropping the overflowing axis evenly on both sides (CSS `object-fit:
 * cover`). Returned in source pixels for drawImage's 9-argument form.
 */
export function coverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): { sx: number; sy: number; sw: number; sh: number } {
  // A zero or negative dimension would make the ratio NaN or flip the
  // crop; fall back to the whole source rather than emitting a rectangle
  // drawImage will reject.
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(srcW, 0), sh: Math.max(srcH, 0) };
  }

  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  if (srcRatio > dstRatio) {
    // Source is wider: keep full height, crop the sides.
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }

  // Source is taller (or equal): keep full width, crop top and bottom.
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/**
 * Largest of `sizes` at which `text` fits `maxWidth`, ellipsizing at the
 * smallest size when even that overflows.
 *
 * Names are user-supplied and unbounded in practice, so a credential must
 * degrade gracefully rather than overrun the card. Mutates ctx.font as it
 * measures; callers set their final font afterwards anyway.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  sizes: readonly number[],
  fontFamily: string,
  weight = "700"
): { size: number; text: string } {
  const ordered = [...sizes].sort((a, b) => b - a);
  const smallest = ordered[ordered.length - 1] ?? 16;

  for (const size of ordered) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) return { size, text };
  }

  // Trim one character at a time at the smallest size. Linear rather than
  // a binary search because measureText is cheap and names are short.
  ctx.font = `${weight} ${smallest}px ${fontFamily}`;
  let truncated = text;
  while (
    truncated.length > 1 &&
    ctx.measureText(`${truncated}…`).width > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return { size: smallest, text: `${truncated.trimEnd()}…` };
}

/** First letter of each name, for the avatar fallback. */
export function initials(firstName: string, lastName: string): string {
  const first = firstName.trim()[0] ?? "";
  const last = lastName.trim()[0] ?? "";
  return `${first}${last}`.toUpperCase() || "?";
}

/** Full display name, collapsing the whitespace a paste can introduce. */
export function displayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
}

// Draw -----------------------------------------------------------------

/**
 * Draws the whole credential. Synchronous by contract: every image must be
 * decoded before calling, so there is no await inside and the caller can
 * export the canvas on the very next line.
 */
export function drawCredential(
  ctx: CanvasRenderingContext2D,
  input: CredentialRenderInput,
  layout: CredentialLayout = CREDENTIAL_LAYOUT
): void {
  const { fontFamily } = layout;

  ctx.save();

  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // A contained white card gives the exported image the same calm surface
  // hierarchy as the builder instead of leaving every element floating in a
  // large empty canvas.
  ctx.save();
  ctx.shadowColor = "rgba(17, 24, 39, 0.10)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(32, 32, layout.width - 64, layout.height - 64);
  ctx.restore();

  drawTechLayer(ctx, layout, fontFamily);
  drawCornerArcs(ctx, layout);
  drawHeader(ctx, input, layout, fontFamily);
  drawAvatarHalo(ctx, layout);
  drawAvatar(ctx, input, layout, fontFamily);
  drawIdentity(ctx, input, layout, fontFamily);
  drawFooter(ctx, input, layout, fontFamily);
  drawBrandBar(ctx, layout);

  ctx.restore();
}

/**
 * Low-contrast circuit pattern behind the content.
 *
 * It is deliberately built from primitive fills instead of a raster texture,
 * so the exported credential stays sharp at every size and adds no asset
 * request to the live preview.
 */
function drawTechLayer(
  ctx: CanvasRenderingContext2D,
  layout: CredentialLayout,
  fontFamily: string
): void {
  ctx.save();

  // Dot matrix: visible enough to give the card depth, quiet enough to keep
  // names and QR codes crisp.
  ctx.fillStyle = "rgba(36, 99, 235, 0.055)";
  for (let y = 300; y <= 930; y += 42) {
    for (let x = 76; x <= 1004; x += 42) {
      ctx.fillRect(x, y, 4, 4);
    }
  }

  // Short circuit traces framing the central identity area.
  ctx.fillStyle = "rgba(36, 99, 235, 0.11)";
  const traces = [
    [76, 348, 154, 3],
    [76, 348, 3, 82],
    [850, 352, 154, 3],
    [1001, 352, 3, 82],
    [76, 862, 122, 3],
    [76, 786, 3, 79],
    [882, 862, 122, 3],
    [1001, 786, 3, 79],
  ] as const;
  traces.forEach(([x, y, width, height]) => ctx.fillRect(x, y, width, height));

  const nodes = [
    [230, 349],
    [850, 353],
    [198, 863],
    [882, 863],
    [78, 430],
    [1002, 434],
    [78, 786],
    [1002, 786],
  ] as const;
  nodes.forEach(([x, y], index) => {
    ctx.beginPath();
    ctx.arc(x, y, index % 3 === 0 ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = `${BRAND_COLORS[index % BRAND_COLORS.length]}33`;
    ctx.fill();
  });

  ctx.font = `600 18px ${fontFamily}`;
  ctx.fillStyle = "rgba(36, 99, 235, 0.55)";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("GDG ICA  //  BUILD · CONNECT · CREATE", 82, 286);

  ctx.restore();
}

function drawAvatarHalo(
  ctx: CanvasRenderingContext2D,
  layout: CredentialLayout
): void {
  const { avatar } = layout;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatar.cx, avatar.cy, avatar.r + 52, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(36, 99, 235, 0.045)";
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(36, 99, 235, 0.12)";
  ctx.beginPath();
  ctx.arc(avatar.cx, avatar.cy, avatar.r + 78, -0.2, Math.PI * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(avatar.cx, avatar.cy, avatar.r + 78, Math.PI * 0.95, Math.PI * 1.85);
  ctx.stroke();

  [0.12, 0.62, 1.12, 1.62].forEach((turn, index) => {
    const angle = turn * Math.PI;
    const radius = avatar.r + 78;
    ctx.beginPath();
    ctx.arc(
      avatar.cx + Math.cos(angle) * radius,
      avatar.cy + Math.sin(angle) * radius,
      8,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = BRAND_COLORS[index];
    ctx.fill();
  });
  ctx.restore();
}

function drawCornerArcs(
  ctx: CanvasRenderingContext2D,
  layout: CredentialLayout
): void {
  const { corner } = layout;
  ctx.save();
  ctx.lineWidth = corner.lineWidth;
  ctx.lineCap = "butt";
  corner.radii.forEach((radius, i) => {
    ctx.beginPath();
    // Quarter arc sweeping from straight-down to straight-left, which is
    // the only quadrant visible from the top-right origin.
    ctx.arc(corner.cx, corner.cy, radius, Math.PI / 2, Math.PI);
    ctx.strokeStyle = BRAND_COLORS[i % BRAND_COLORS.length];
    ctx.stroke();
  });
  ctx.restore();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  input: CredentialRenderInput,
  layout: CredentialLayout,
  fontFamily: string
): void {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const headline = fitText(
    ctx,
    input.headline,
    layout.headline.maxWidth,
    [layout.headline.size],
    fontFamily,
    "500"
  );
  ctx.font = `500 ${headline.size}px ${fontFamily}`;
  ctx.fillStyle = layout.headline.color;
  ctx.fillText(headline.text, layout.headline.x, layout.headline.y);

  const eventName = fitText(
    ctx,
    input.eventName,
    layout.eventName.maxWidth,
    layout.eventName.sizes,
    fontFamily
  );
  ctx.font = `700 ${eventName.size}px ${fontFamily}`;
  ctx.fillStyle = layout.eventName.color;
  ctx.fillText(eventName.text, layout.eventName.x, layout.eventName.y);

  ctx.restore();
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  input: CredentialRenderInput,
  layout: CredentialLayout,
  fontFamily: string
): void {
  const { avatar } = layout;
  const diameter = avatar.r * 2;

  // Photo, clipped to the circle. The clip must be established BEFORE
  // drawImage or the image renders as a square over the whole card.
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatar.cx, avatar.cy, avatar.r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (input.avatar) {
    const { width, height } = sourceSize(input.avatar);
    const { sx, sy, sw, sh } = coverRect(width, height, diameter, diameter);
    ctx.drawImage(
      input.avatar,
      sx,
      sy,
      sw,
      sh,
      avatar.cx - avatar.r,
      avatar.cy - avatar.r,
      diameter,
      diameter
    );
  } else {
    // Initials fallback. Reachable if a mascot asset fails to load; the
    // credential still renders rather than showing a hole.
    ctx.fillStyle = "#e4e4e7";
    ctx.fillRect(
      avatar.cx - avatar.r,
      avatar.cy - avatar.r,
      diameter,
      diameter
    );
    ctx.fillStyle = "#4b5563";
    ctx.font = `700 ${Math.round(avatar.r)}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      initials(input.firstName, input.lastName),
      avatar.cx,
      avatar.cy
    );
  }
  ctx.restore();

  // Four-segment brand ring around the avatar.
  ctx.save();
  ctx.lineWidth = avatar.ringWidth;
  ctx.lineCap = "butt";
  const sweep = (Math.PI * 2) / BRAND_COLORS.length;
  BRAND_COLORS.forEach((color, i) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.arc(
      avatar.cx,
      avatar.cy,
      avatar.r + avatar.ringWidth / 2,
      i * sweep + avatar.ringGap / 2,
      (i + 1) * sweep - avatar.ringGap / 2
    );
    ctx.stroke();
  });
  ctx.restore();
}

function drawIdentity(
  ctx: CanvasRenderingContext2D,
  input: CredentialRenderInput,
  layout: CredentialLayout,
  fontFamily: string
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const name = fitText(
    ctx,
    displayName(input.firstName, input.lastName),
    layout.name.maxWidth,
    layout.name.sizes,
    fontFamily
  );
  ctx.font = `700 ${name.size}px ${fontFamily}`;
  ctx.fillStyle = layout.name.color;
  ctx.fillText(name.text, layout.name.x, layout.name.y);

  // GitHub renders as TEXT ONLY, never as a fetched avatar. Drawing an
  // image from avatars.githubusercontent.com without a CORS-clean load
  // taints the canvas, and toDataURL then throws SecurityError — which
  // would kill the entire feature silently, at export time, on someone
  // else's infrastructure decision.
  if (input.githubUsername) {
    ctx.font = `400 ${layout.handle.size}px ${fontFamily}`;
    ctx.fillStyle = layout.handle.color;
    ctx.fillText(`@${input.githubUsername}`, layout.handle.x, layout.handle.y);
  }

  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  input: CredentialRenderInput,
  layout: CredentialLayout,
  fontFamily: string
): void {
  const { group } = layout;

  ctx.save();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(64, 992, 952, 230);
  ctx.restore();

  // Group letter badge.
  ctx.save();
  ctx.beginPath();
  ctx.arc(group.cx, group.cy, group.r, 0, Math.PI * 2);
  ctx.closePath();
  const groupPending = input.groupLetter === "—";
  ctx.fillStyle = groupPending ? "#e5e7eb" : BRAND_COLORS[0];
  ctx.fill();

  ctx.fillStyle = groupPending ? "#4b5563" : "#ffffff";
  ctx.font = `700 ${group.size}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.groupLetter, group.cx, group.cy);

  ctx.font = `500 ${group.label.size}px ${fontFamily}`;
  ctx.fillStyle = group.label.color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    groupPending ? "AL GUARDAR" : "TU GRUPO",
    group.cx,
    group.label.y
  );
  ctx.restore();

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const date = fitText(
    ctx,
    input.eventDateLabel,
    layout.eventDate.maxWidth,
    [layout.eventDate.size],
    fontFamily,
    "600"
  );
  ctx.font = `600 ${date.size}px ${fontFamily}`;
  ctx.fillStyle = layout.eventDate.color;
  ctx.fillText(date.text, layout.eventDate.x, layout.eventDate.y);

  const cta = fitText(
    ctx,
    input.ctaLabel,
    layout.cta.maxWidth,
    [layout.cta.size],
    fontFamily,
    "400"
  );
  ctx.font = `400 ${cta.size}px ${fontFamily}`;
  ctx.fillStyle = layout.cta.color;
  ctx.fillText(cta.text, layout.cta.x, layout.cta.y);
  ctx.restore();

  // QR of the public event page. Skipped without throwing when absent.
  if (input.qrImage) {
    const { qr } = layout;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(
      qr.x - qr.quietZone,
      qr.y - qr.quietZone,
      qr.size + qr.quietZone * 2,
      qr.size + qr.quietZone * 2
    );
    ctx.drawImage(input.qrImage, qr.x, qr.y, qr.size, qr.size);
    ctx.restore();
  }
}

function drawBrandBar(
  ctx: CanvasRenderingContext2D,
  layout: CredentialLayout
): void {
  const { brandBar } = layout;
  const segment = layout.width / BRAND_COLORS.length;
  ctx.save();
  BRAND_COLORS.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * segment, brandBar.y, segment, brandBar.height);
  });
  ctx.restore();
}

/**
 * Intrinsic size of any CanvasImageSource.
 *
 * HTMLImageElement reports naturalWidth, ImageBitmap and canvases report
 * width/height, and SVGImageElement may report neither — which is exactly
 * why the mascots ship as PNG.
 */
function sourceSize(source: CanvasImageSource): {
  width: number;
  height: number;
} {
  const candidate = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number | SVGAnimatedLength;
    height?: number | SVGAnimatedLength;
  };

  const width =
    candidate.naturalWidth ??
    (typeof candidate.width === "number" ? candidate.width : 0);
  const height =
    candidate.naturalHeight ??
    (typeof candidate.height === "number" ? candidate.height : 0);

  return { width, height };
}

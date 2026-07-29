import { describe, expect, it } from "vitest";
import {
  BRAND_COLORS,
  CREDENTIAL_LAYOUT,
  coverRect,
  displayName,
  drawCredential,
  fitText,
  initials,
  type CredentialRenderInput,
} from "../renderCredential";
import { createMockContext, fakeImage } from "./mockContext";

const BASE_INPUT: CredentialRenderInput = {
  headline: "Soy parte del",
  eventName: "DevFest ICA 2026",
  eventDateLabel: "21 de noviembre de 2026",
  firstName: "Alvaro",
  lastName: "Pena",
  githubUsername: "aalvaropc",
  groupLetter: "Q",
  avatar: fakeImage(512, 512),
  qrImage: fakeImage(256, 256),
  ctaLabel: "Registrate en gdgica.com",
};

describe("coverRect", () => {
  it("crops the sides of a landscape source", () => {
    const r = coverRect(1000, 500, 200, 200);
    expect(r.sh).toBe(500);
    expect(r.sw).toBe(500);
    // Centered: equal crop left and right.
    expect(r.sx).toBe(250);
    expect(r.sy).toBe(0);
  });

  it("crops the top and bottom of a portrait source", () => {
    const r = coverRect(500, 1000, 200, 200);
    expect(r.sw).toBe(500);
    expect(r.sh).toBe(500);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(250);
  });

  it("leaves a square source untouched for a square destination", () => {
    expect(coverRect(512, 512, 200, 200)).toEqual({
      sx: 0,
      sy: 0,
      sw: 512,
      sh: 512,
    });
  });

  it("keeps the crop inside the source for every aspect", () => {
    const cases: Array<[number, number]> = [
      [4000, 3000],
      [3000, 4000],
      [1920, 1080],
      [640, 640],
      [100, 3000],
    ];
    for (const [w, h] of cases) {
      const r = coverRect(w, h, 380, 380);
      expect(r.sw).toBeGreaterThan(0);
      expect(r.sh).toBeGreaterThan(0);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.sw).toBeLessThanOrEqual(w + 0.001);
      expect(r.sy + r.sh).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it("never returns negative dimensions for degenerate input", () => {
    for (const r of [
      coverRect(0, 0, 200, 200),
      coverRect(-10, 100, 200, 200),
      coverRect(100, 100, 0, 200),
    ]) {
      expect(r.sw).toBeGreaterThanOrEqual(0);
      expect(r.sh).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("fitText", () => {
  const { ctx } = createMockContext();
  const SIZES = [76, 64, 54, 44];

  it("keeps the largest size when the text fits", () => {
    const r = fitText(ctx, "Ana Paz", 900, SIZES, "sans");
    expect(r.size).toBe(76);
    expect(r.text).toBe("Ana Paz");
  });

  it("steps down to the largest size that fits", () => {
    const r = fitText(ctx, "Maria Fernanda Quintanilla", 900, SIZES, "sans");
    expect(r.size).toBeLessThan(76);
    expect(SIZES).toContain(r.size);
    expect(r.text).toBe("Maria Fernanda Quintanilla");
  });

  it("ellipsizes at the smallest size when nothing fits", () => {
    const long = "a".repeat(120);
    const r = fitText(ctx, long, 900, SIZES, "sans");
    expect(r.size).toBe(44);
    expect(r.text.endsWith("…")).toBe(true);
    expect(r.text.length).toBeLessThan(long.length);
  });

  it("never exceeds maxWidth, even for a 40-character name", () => {
    const name = "Maria Jose Quintanilla-Garcia Nanez Diaz";
    expect(name.length).toBe(40);
    const r = fitText(
      ctx,
      name,
      CREDENTIAL_LAYOUT.name.maxWidth,
      SIZES,
      "sans"
    );
    ctx.font = `700 ${r.size}px sans`;
    expect(ctx.measureText(r.text).width).toBeLessThanOrEqual(
      CREDENTIAL_LAYOUT.name.maxWidth
    );
  });

  it("does not strip a single character down to nothing", () => {
    const r = fitText(ctx, "M", 1, SIZES, "sans");
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe("initials / displayName", () => {
  it("takes the first letter of each name, uppercased", () => {
    expect(initials("alvaro", "pena")).toBe("AP");
  });

  it("falls back to ? when both names are blank", () => {
    expect(initials("", "  ")).toBe("?");
  });

  it("collapses pasted whitespace in the display name", () => {
    expect(displayName("  Alvaro ", "  Pena  ")).toBe("Alvaro Pena");
  });
});

describe("drawCredential", () => {
  it("balances every save with a restore", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    expect(m.callsTo("save").length).toBe(m.callsTo("restore").length);
  });

  it("never leaves the stack unbalanced mid-draw", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    let depth = 0;
    for (const method of m.sequence()) {
      if (method === "save") depth++;
      if (method === "restore") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("clips to the avatar circle BEFORE drawing the photo", () => {
    // Without the clip first, the photo renders as a square across the
    // whole card instead of inside the circle.
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const seq = m.sequence();
    const clipAt = seq.indexOf("clip");
    const drawAt = seq.indexOf("drawImage");
    expect(clipAt).toBeGreaterThan(-1);
    expect(drawAt).toBeGreaterThan(clipAt);
  });

  it("draws the avatar arc at the layout's centre and radius", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const { avatar } = CREDENTIAL_LAYOUT;
    const clipArc = m
      .callsTo("arc")
      .find(
        (c) =>
          c.args[0] === avatar.cx &&
          c.args[1] === avatar.cy &&
          c.args[2] === avatar.r
      );
    expect(clipArc).toBeDefined();
  });

  it("covers the avatar box with the photo without distortion", () => {
    const m = createMockContext();
    // A wide photo must be cropped, not squashed.
    drawCredential(m.ctx, { ...BASE_INPUT, avatar: fakeImage(1600, 900) });
    const [call] = m.callsTo("drawImage");
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = call.args as number[];
    expect(sw).toBe(sh);
    expect(sx).toBeGreaterThan(0);
    expect(sy).toBe(0);
    const { avatar } = CREDENTIAL_LAYOUT;
    expect(dw).toBe(avatar.r * 2);
    expect(dh).toBe(avatar.r * 2);
    expect(dx).toBe(avatar.cx - avatar.r);
    expect(dy).toBe(avatar.cy - avatar.r);
  });

  it("falls back to initials when no avatar is available", () => {
    const m = createMockContext();
    drawCredential(m.ctx, { ...BASE_INPUT, avatar: null });
    expect(m.callsTo("drawImage").length).toBe(1); // the QR only
    const texts = m.callsTo("fillText").map((c) => c.args[0]);
    expect(texts).toContain("AP");
  });

  it("draws the group letter exactly once", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const drawn = m
      .callsTo("fillText")
      .filter((c) => c.args[0] === BASE_INPUT.groupLetter);
    expect(drawn.length).toBe(1);
  });

  it("centres the group letter in its badge", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const { group } = CREDENTIAL_LAYOUT;
    const letter = m
      .callsTo("fillText")
      .find((c) => c.args[0] === BASE_INPUT.groupLetter);
    expect(letter?.args[1]).toBe(group.cx);
    expect(letter?.args[2]).toBe(group.cy);
  });

  it("renders the GitHub username as text, never as an image", () => {
    // Fetching avatars.githubusercontent.com into the canvas would taint
    // it and make toDataURL throw at export time.
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const texts = m.callsTo("fillText").map((c) => c.args[0]);
    expect(texts).toContain("@aalvaropc");
  });

  it("omits the handle line entirely when there is no GitHub username", () => {
    const m = createMockContext();
    drawCredential(m.ctx, { ...BASE_INPUT, githubUsername: null });
    const texts = m.callsTo("fillText").map((c) => String(c.args[0]));
    expect(texts.some((t) => t.startsWith("@"))).toBe(false);
  });

  it("skips the QR without throwing when it is null", () => {
    const m = createMockContext();
    expect(() =>
      drawCredential(m.ctx, { ...BASE_INPUT, qrImage: null })
    ).not.toThrow();
    // Only the avatar is drawn.
    expect(m.callsTo("drawImage").length).toBe(1);
  });

  it("paints a white quiet zone behind the QR so it stays scannable", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const { qr } = CREDENTIAL_LAYOUT;
    const quiet = m
      .callsTo("fillRect")
      .find(
        (c) =>
          c.args[0] === qr.x - qr.quietZone && c.args[1] === qr.y - qr.quietZone
      );
    expect(quiet).toBeDefined();
    expect(quiet?.fillStyle).toBe("#ffffff");
  });

  it("draws the brand bar in the four Google colors across the full width", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const { brandBar } = CREDENTIAL_LAYOUT;
    const bars = m.callsTo("fillRect").filter((c) => c.args[1] === brandBar.y);
    expect(bars.length).toBe(BRAND_COLORS.length);
    expect(bars.map((b) => b.fillStyle)).toEqual([...BRAND_COLORS]);
    const totalWidth = bars.reduce((sum, b) => sum + (b.args[2] as number), 0);
    expect(totalWidth).toBeCloseTo(CREDENTIAL_LAYOUT.width);
  });

  it("fills the whole card before drawing anything on it", () => {
    const m = createMockContext();
    drawCredential(m.ctx, BASE_INPUT);
    const first = m.callsTo("fillRect")[0];
    expect(first.args).toEqual([
      0,
      0,
      CREDENTIAL_LAYOUT.width,
      CREDENTIAL_LAYOUT.height,
    ]);
  });

  it("keeps every drawn string inside the card horizontally", () => {
    const m = createMockContext();
    drawCredential(m.ctx, {
      ...BASE_INPUT,
      firstName: "Maria Fernanda",
      lastName: "Quintanilla-Garcia Nanez",
      eventName: "DevFest ICA 2026 Edicion Aniversario",
    });
    for (const call of m.callsTo("fillText")) {
      const x = call.args[1] as number;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(CREDENTIAL_LAYOUT.width);
    }
  });

  it("does not throw on empty names", () => {
    const m = createMockContext();
    expect(() =>
      drawCredential(m.ctx, {
        ...BASE_INPUT,
        firstName: "",
        lastName: "",
        avatar: null,
      })
    ).not.toThrow();
  });
});

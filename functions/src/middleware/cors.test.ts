import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ALLOWED_ORIGINS, isAllowedOrigin, rejectDisallowedOrigin } from "./cors";

const ORIGINAL = process.env.FUNCTIONS_EMULATOR;

function asEmulator() {
  process.env.FUNCTIONS_EMULATOR = "true";
}
function asProduction() {
  delete process.env.FUNCTIONS_EMULATOR;
}

beforeEach(() => asProduction());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FUNCTIONS_EMULATOR;
  else process.env.FUNCTIONS_EMULATOR = ORIGINAL;
});

describe("isAllowedOrigin — production", () => {
  it.each(ALLOWED_ORIGINS)("accepts the deployed origin %s", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  // The whole point of gating the loopback bypass. If this ever passes,
  // any page served from a developer machine — or anything that can bind
  // a local port on a visitor's box — can call the production API.
  it.each([
    "http://localhost:9999",
    "http://localhost:4322",
    "http://127.0.0.1:4321",
    "http://[::1]:4321",
  ])("rejects loopback origin %s outside the emulator", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });

  it.each([
    "https://evil.example.com",
    "http://gdgica.com", // http, not https
    "https://gdgica.com.evil.example",
    "https://sub.gdgica.com",
    "null",
    "",
  ])("rejects %j", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });
});

describe("isAllowedOrigin — emulator", () => {
  beforeEach(() => asEmulator());

  // Astro moves to the next free port when 4321 is taken, and some
  // machines resolve localhost to IPv6. Pinning one origin meant every
  // API call failed with no usable diagnostic.
  it.each([
    "http://localhost:4321",
    "http://localhost:4324",
    "http://localhost",
    "http://127.0.0.1:5173",
    "http://[::1]:4321",
  ])("accepts loopback origin %s", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it("still rejects a non-loopback origin", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("does not accept https loopback, which we never serve", () => {
    expect(isAllowedOrigin("https://localhost:4321")).toBe(false);
  });

  it("does not accept a host merely containing localhost", () => {
    expect(isAllowedOrigin("http://localhost.evil.example")).toBe(false);
    expect(isAllowedOrigin("http://notlocalhost:4321")).toBe(false);
  });
});

describe("rejectDisallowedOrigin", () => {
  function mockRes() {
    const res = { statusCode: 0, body: null as unknown } as unknown as Response;
    (res as unknown as { status: (c: number) => Response }).status = (c) => {
      (res as unknown as { statusCode: number }).statusCode = c;
      return res;
    };
    (res as unknown as { json: (b: unknown) => Response }).json = (b) => {
      (res as unknown as { body: unknown }).body = b;
      return res;
    };
    return res as Response & { statusCode: number; body: { error?: string } };
  }
  const reqWith = (origin?: string) =>
    ({ headers: origin ? { origin } : {} }) as unknown as Request;

  it("answers 403 with the offending origin instead of a bare 500", () => {
    const res = mockRes();
    const next = vi.fn();
    rejectDisallowedOrigin(reqWith("https://evil.example.com"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("https://evil.example.com");
  });

  it("lets an allowed origin through", () => {
    const res = mockRes();
    const next = vi.fn();
    rejectDisallowedOrigin(reqWith("https://gdgica.com"), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  // curl, server-to-server calls and health checks send no Origin. They
  // were never subject to CORS and must not start failing now.
  it("lets a request with no Origin header through", () => {
    const res = mockRes();
    const next = vi.fn();
    rejectDisallowedOrigin(reqWith(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // Origin is caller-controlled and unbounded, and it is echoed into both
  // the body and the log. Without a cap, a caller can inflate responses
  // and Cloud Logging entries at will, one large string per request.
  it("truncates an oversized origin instead of echoing it whole", () => {
    const res = mockRes();
    const huge = `https://${"a".repeat(5000)}.example.com`;
    rejectDisallowedOrigin(reqWith(huge), res, vi.fn());

    expect(res.statusCode).toBe(403);
    const message = res.body.error ?? "";
    expect(message.length).toBeLessThan(300);
    expect(message).toContain("…");
  });

  // If express ever does start seeing preflight, this must keep holding.
  // Today something upstream answers OPTIONS before we run — see the note
  // on rejectDisallowedOrigin — so this pins the unit behaviour only.
  it("rejects a preflight from a disallowed origin", () => {
    const res = mockRes();
    const next = vi.fn();
    const req = {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    } as unknown as Request;
    rejectDisallowedOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

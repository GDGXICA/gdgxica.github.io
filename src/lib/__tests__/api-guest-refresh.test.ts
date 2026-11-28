// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gdgica.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
} from "../guestSession";

vi.mock("../auth", () => ({
  getIdToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("../firebase", () => ({
  getAppCheckToken: vi.fn().mockResolvedValue(null),
}));

const GUEST_STORAGE_KEY = "gdg_minigame_guest_session";

describe("api participant guest-session 401 recovery", () => {
  beforeEach(() => {
    clearStoredGuestSession();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearStoredGuestSession();
    vi.unstubAllGlobals();
  });

  it("clears a rejected guest token, mints a fresh session, and retries once", async () => {
    const stale = {
      uid: "g_staleSession01",
      token: "guest.stale.signature",
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    const fresh = {
      uid: "g_freshSession02",
      token: "guest.fresh.signature",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(stale));

    const fetchMock = vi
      .fn()
      // 1. First join fails with 401 because the cached guest token is stale.
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, error: "Invalid token" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      // 2. api.ts transparently requests a new guest session.
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: fresh }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 3. Retried join succeeds with the fresh guest token.
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { alias: "Alvaro", instances: [] },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const res = await api.joinEventMinigames("devfest-2026", {
      alias: "Alvaro",
    });

    expect(res.success).toBe(true);
    expect(res.data?.alias).toBe("Alvaro");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/events/devfest-2026/minigames/join"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/events/devfest-2026/minigames/session"
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: `Bearer ${fresh.token}`,
      }),
    });
    expect(getStoredGuestSession()?.uid).toBe(fresh.uid);
  });

  it("does not loop infinitely if the refreshed guest session also gets 401", async () => {
    const stale = {
      uid: "g_staleSession01",
      token: "guest.stale.signature",
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    const fresh = {
      uid: "g_freshSession02",
      token: "guest.fresh.signature",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(stale));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: fresh }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, error: "Still denied" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const res = await api.joinEventMinigames("devfest-2026", {
      alias: "Alvaro",
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

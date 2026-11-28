import { recordServerClockSample } from "./serverClock";

const GUEST_SESSION_KEY = "gdg_minigame_guest_session";
const MIN_REMAINING_MS = 10 * 60 * 1000;

export interface GuestSession {
  uid: string;
  token: string;
  expiresAt: number;
}

let inflightSession: Promise<GuestSession | null> | null = null;

export function getStoredGuestSession(
  nowMs: number = Date.now()
): GuestSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestSession>;
    if (
      typeof parsed.uid === "string" &&
      parsed.uid.startsWith("g_") &&
      typeof parsed.token === "string" &&
      parsed.token.startsWith("guest.") &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt - nowMs > MIN_REMAINING_MS
    ) {
      return {
        uid: parsed.uid,
        token: parsed.token,
        expiresAt: parsed.expiresAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function getGuestSessionToken(): string | null {
  return getStoredGuestSession()?.token ?? null;
}

export function clearStoredGuestSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    return;
  }
}

function storeGuestSession(session: GuestSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  } catch {
    return;
  }
}

async function fetchGuestSession(slug: string): Promise<GuestSession | null> {
  if (typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const startedAt = Date.now();
    const res = await fetch(
      `/api/events/${encodeURIComponent(slug)}/minigames/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      }
    );
    const endedAt = Date.now();
    const serverTimeHeader = res.headers?.get("X-Server-Time-Ms");
    if (serverTimeHeader) {
      const parsedMs = Number(serverTimeHeader);
      if (Number.isFinite(parsedMs)) {
        recordServerClockSample(
          parsedMs,
          Math.round((startedAt + endedAt) / 2),
          endedAt - startedAt
        );
      }
    }
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: Partial<GuestSession>;
    } | null;
    const data = json?.data;
    if (
      json?.success &&
      typeof data?.uid === "string" &&
      typeof data?.token === "string" &&
      typeof data?.expiresAt === "number"
    ) {
      const session: GuestSession = {
        uid: data.uid,
        token: data.token,
        expiresAt: data.expiresAt,
      };
      storeGuestSession(session);
      return session;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ensures a participant session for Poll, Quiz, and Roulette without hitting
 * Firebase Auth's 100 anonymous sign-ups/hour/IP cap on shared event Wi-Fi.
 */
export async function ensureMinigameSession(
  slug: string
): Promise<GuestSession | null> {
  const existing = getStoredGuestSession();
  if (existing) return existing;

  if (!inflightSession) {
    inflightSession = fetchGuestSession(slug).finally(() => {
      inflightSession = null;
    });
  }
  return inflightSession;
}

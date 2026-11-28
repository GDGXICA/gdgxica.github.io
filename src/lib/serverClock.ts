let clockOffsetMs = 0;
let sampled = false;
let bestRttMs = Number.POSITIVE_INFINITY;

export function recordServerClockSample(
  serverTimeMs: number,
  clientMidMs: number = Date.now(),
  rttMs: number = Number.POSITIVE_INFINITY
): void {
  if (!Number.isFinite(serverTimeMs) || !Number.isFinite(clientMidMs)) return;
  const validRtt = Number.isFinite(rttMs) && rttMs >= 0 ? rttMs : null;

  // Never let a slow cold-start or congested request overwrite a tighter
  // NTP-like sample; a 3s cold start can skew clientMidMs by ~1.5s and
  // lock quiz buttons early.
  if (
    sampled &&
    validRtt !== null &&
    bestRttMs < 800 &&
    validRtt > Math.max(1_000, bestRttMs * 1.5)
  ) {
    return;
  }

  clockOffsetMs = Math.round(serverTimeMs - clientMidMs);
  sampled = true;
  if (validRtt !== null && validRtt < bestRttMs) {
    bestRttMs = validRtt;
  }
}

export function hasServerClockSample(): boolean {
  return sampled;
}

export function getServerClockOffsetMs(): number {
  return clockOffsetMs;
}

export function getServerNowMs(): number {
  return Date.now() + clockOffsetMs;
}

export function resetServerClockOffset(): void {
  clockOffsetMs = 0;
  sampled = false;
  bestRttMs = Number.POSITIVE_INFINITY;
}

export async function syncServerClock(): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const startedAt = Date.now();
    const res = await fetch("/api/time", {
      cache: "no-store",
      signal: controller.signal,
    });
    const endedAt = Date.now();
    const rttMs = endedAt - startedAt;
    const mid = Math.round((startedAt + endedAt) / 2);
    const header = res.headers?.get("X-Server-Time-Ms");
    if (header) {
      const parsed = Number(header);
      if (Number.isFinite(parsed)) {
        recordServerClockSample(parsed, mid, rttMs);
        return;
      }
    }
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as {
      data?: { serverTimeMs?: number };
    } | null;
    const bodyTime = json?.data?.serverTimeMs;
    if (typeof bodyTime === "number" && Number.isFinite(bodyTime)) {
      recordServerClockSample(bodyTime, mid, rttMs);
    }
  } catch {
    return;
  } finally {
    window.clearTimeout(timer);
  }
}

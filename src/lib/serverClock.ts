let clockOffsetMs = 0;
let sampled = false;

export function recordServerClockSample(
  serverTimeMs: number,
  clientMidMs: number = Date.now()
): void {
  if (!Number.isFinite(serverTimeMs) || !Number.isFinite(clientMidMs)) return;
  clockOffsetMs = Math.round(serverTimeMs - clientMidMs);
  sampled = true;
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
    const mid = Math.round((startedAt + endedAt) / 2);
    const header = res.headers?.get("X-Server-Time-Ms");
    if (header) {
      const parsed = Number(header);
      if (Number.isFinite(parsed)) {
        recordServerClockSample(parsed, mid);
        return;
      }
    }
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as {
      data?: { serverTimeMs?: number };
    } | null;
    const bodyTime = json?.data?.serverTimeMs;
    if (typeof bodyTime === "number" && Number.isFinite(bodyTime)) {
      recordServerClockSample(bodyTime, mid);
    }
  } catch {
    return;
  } finally {
    window.clearTimeout(timer);
  }
}

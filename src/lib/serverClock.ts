let clockOffsetMs = 0;

export function recordServerClockSample(
  serverTimeMs: number,
  clientMidMs: number = Date.now()
): void {
  if (!Number.isFinite(serverTimeMs) || !Number.isFinite(clientMidMs)) return;
  clockOffsetMs = Math.round(serverTimeMs - clientMidMs);
}

export function getServerClockOffsetMs(): number {
  return clockOffsetMs;
}

export function getServerNowMs(): number {
  return Date.now() + clockOffsetMs;
}

export function resetServerClockOffset(): void {
  clockOffsetMs = 0;
}

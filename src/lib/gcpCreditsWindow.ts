export type CreditWindowPhase = "before" | "active" | "grace" | "closed";

export interface CreditWindowBounds {
  opensAt: string;
  creditsEndAt: string;
  viewClosesAt: string;
}

export interface CreditWindowState {
  phase: CreditWindowPhase;
  targetMs: number | null;
  remainingMs: number;
  creditsProgressPercent: number;
}

export interface CountdownParts {
  hours: string;
  minutes: string;
  seconds: string;
}

export function getCreditWindowState(
  nowMs: number,
  bounds: CreditWindowBounds
): CreditWindowState {
  const opensMs = Date.parse(bounds.opensAt);
  const creditsEndMs = Date.parse(bounds.creditsEndAt);
  const viewClosesMs = Date.parse(bounds.viewClosesAt);

  if (nowMs < opensMs) {
    return {
      phase: "before",
      targetMs: opensMs,
      remainingMs: Math.max(0, opensMs - nowMs),
      creditsProgressPercent: 0,
    };
  }

  if (nowMs < creditsEndMs) {
    const duration = Math.max(1, creditsEndMs - opensMs);
    const elapsed = Math.min(duration, Math.max(0, nowMs - opensMs));
    return {
      phase: "active",
      targetMs: creditsEndMs,
      remainingMs: Math.max(0, creditsEndMs - nowMs),
      creditsProgressPercent: Math.round((elapsed / duration) * 100),
    };
  }

  if (nowMs < viewClosesMs) {
    return {
      phase: "grace",
      targetMs: viewClosesMs,
      remainingMs: Math.max(0, viewClosesMs - nowMs),
      creditsProgressPercent: 100,
    };
  }

  return {
    phase: "closed",
    targetMs: null,
    remainingMs: 0,
    creditsProgressPercent: 100,
  };
}

export function splitCountdown(remainingMs: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

export function resolvePreviewTimeMs(
  search: string,
  isDev: boolean
): number | null {
  if (!isDev || !search) return null;
  const raw = new URLSearchParams(search).get("at");
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPeruTime(nowMs: number): string {
  try {
    return new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(nowMs));
  } catch {
    const d = new Date(nowMs);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }
}

// Synthesized stage audio using the browser's Web Audio API.
// Zero external dependencies, zero network assets, muted by default.

let ctx: AudioContext | null = null;
let enabled = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx = new AudioCtor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isStageAudioEnabled(): boolean {
  return enabled;
}

export function setStageAudioEnabled(next: boolean): boolean {
  enabled = next;
  if (next) {
    const c = getContext();
    if (!c) {
      enabled = false;
    }
  }
  return enabled;
}

function tone(
  freq: number,
  durationSec: number,
  opts: {
    type?: OscillatorType;
    gain?: number;
    delaySec?: number;
    endFreq?: number;
  } = {}
) {
  if (!enabled) return;
  const c = getContext();
  if (!c) return;
  const now = c.currentTime + (opts.delaySec ?? 0);
  const osc = c.createOscillator();
  const gainNode = c.createGain();
  osc.type = opts.type ?? "triangle";
  osc.frequency.setValueAtTime(freq, now);
  if (opts.endFreq) {
    osc.frequency.exponentialRampToValueAtTime(opts.endFreq, now + durationSec);
  }
  const peak = opts.gain ?? 0.12;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gainNode);
  gainNode.connect(c.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/** Short crisp peg click synced to roulette wheel segments. */
export function playWheelTick(intensity = 1) {
  const clamped = Math.max(0.35, Math.min(1, intensity));
  tone(780 + clamped * 260, 0.045, {
    type: "triangle",
    gain: 0.09 * clamped,
    endFreq: 260,
  });
}

/** Subtle countdown pulse for the final seconds of a quiz question. */
export function playCountdownTick(urgent: boolean) {
  tone(urgent ? 980 : 660, urgent ? 0.08 : 0.055, {
    type: "sine",
    gain: urgent ? 0.11 : 0.06,
  });
}

/** Celebratory rising triad arpeggio for roulette or bingo winners. */
export function playWinnerFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, i) => {
    tone(n, 0.28, {
      type: "triangle",
      gain: 0.13,
      delaySec: i * 0.085,
    });
  });
}

/** Building chords for staggered Top 3 podium reveal (3rd -> 2nd -> 1st). */
export function playPodiumChord(place: 1 | 2 | 3) {
  const chords: Record<1 | 2 | 3, number[]> = {
    3: [392.0, 493.88, 587.33],
    2: [440.0, 554.37, 659.25],
    1: [523.25, 659.25, 783.99, 1046.5],
  };
  const notes = chords[place];
  notes.forEach((freq, idx) => {
    tone(freq, place === 1 ? 0.55 : 0.34, {
      type: "triangle",
      gain: place === 1 ? 0.12 : 0.09,
      delaySec: idx * 0.05,
    });
  });
}

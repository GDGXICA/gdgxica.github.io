import type { CSSProperties } from "react";

const COLORS = [
  "#2463eb",
  "#ef4444",
  "#ebb308",
  "#16a34a",
  "#d4ad62",
  "#ffffff",
];

const PIECES = Array.from({ length: 32 }, (_, i) => {
  const left = ((i * 31 + 7) % 96) + 2;
  const delay = ((i * 73) % 900) / 1000;
  const drift = ((i % 7) - 3) * 28;
  const turn = (i % 2 === 0 ? 1 : -1) * (240 + (i % 5) * 90);
  const size = 7 + (i % 4) * 3;
  const color = COLORS[i % COLORS.length];
  return { id: i, left, delay, drift, turn, size, color };
});

interface Props {
  /** Change the key to replay the burst cleanly. */
  burstKey?: string | number;
}

export function StageConfetti({ burstKey = 0 }: Props) {
  return (
    <div
      key={burstKey}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden"
    >
      {PIECES.map((p) => (
        <span
          key={p.id}
          className="animate-credential-confetti absolute -top-4 block rounded-[2px]"
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${Math.round(p.size * 0.6)}px`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              "--confetti-drift": `${p.drift}px`,
              "--confetti-turn": `${p.turn}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

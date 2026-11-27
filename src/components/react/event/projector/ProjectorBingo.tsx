import { useMemo } from "react";
import { StageConfetti } from "../StageConfetti";
import { CrownIcon, MedalIcon, TrophyIcon } from "../icons";
import type { LiveInstance } from "../types";
import { useBingoWinners, type BingoWinner } from "../useBingoWinners";

const BALL_COLORS = [
  "bg-google-blue text-white",
  "bg-google-red text-white",
  "bg-google-yellow text-[#070b16]",
  "bg-google-green text-white",
];

const BALL_COLORS_SOFT = [
  "bg-google-blue/75 text-white",
  "bg-google-red/75 text-white",
  "bg-google-yellow/80 text-[#070b16]",
  "bg-google-green/75 text-white",
];

function ballColor(index: number, soft = false): string {
  const palette = soft ? BALL_COLORS_SOFT : BALL_COLORS;
  const n = palette.length;
  return palette[((index % n) + n) % n];
}

function formatWinTime(value: { seconds?: number } | null | undefined): string {
  if (!value?.seconds) return "—";
  return new Date(value.seconds * 1000).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  slug: string;
  instance: LiveInstance;
}

export function ProjectorBingo({ slug, instance }: Props) {
  if (instance.config?.classic === true) {
    return <ProjectorBingoClassic slug={slug} instance={instance} />;
  }
  return <ProjectorBingoConference slug={slug} instance={instance} />;
}

function ProjectorBingoClassic({ slug, instance }: Props) {
  const { winners } = useBingoWinners(slug, instance.id);
  const isClosed = instance.state === "closed";
  const prizes = (instance.config?.prizes as number | undefined) ?? 3;
  const bankSize =
    (instance.config?.terms as string[] | undefined)?.length ?? 0;

  const drawn = instance.drawnTerms ?? [];
  const drawCount = instance.drawCount ?? drawn.length;
  const current = instance.lastDrawnTerm ?? null;

  const drawKey = `${instance.lastDrawAt?.seconds ?? 0}-${drawCount}`;
  const previous = useMemo(() => drawn.slice(0, -1).reverse(), [drawn]);

  if (isClosed) {
    return (
      <div className="relative flex flex-1 flex-col justify-center">
        {winners.length > 0 && <StageConfetti burstKey="bingo-closed" />}
        <div className="mx-auto w-full max-w-5xl text-center">
          <div className="border-google-green/45 bg-google-green/15 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm font-semibold tracking-[0.18em] text-green-300 uppercase">
            <TrophyIcon size={16} />
            Bingo finalizado
          </div>
          <h2 className="mt-4 font-(family-name:--font-display) text-4xl font-bold text-white sm:text-6xl">
            {instance.title}
          </h2>
          <div className="mt-8 text-left">
            <BingoWinnerList winners={winners} prizes={prizes} large />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold tracking-[0.18em] text-green-300 uppercase">
            Bingo clásico
          </p>
          <h2 className="mt-1 font-(family-name:--font-display) text-3xl leading-tight font-bold text-white sm:text-5xl">
            {instance.title}
          </h2>
        </div>
        <span className="rounded-full border border-white/15 bg-[#0b0d13] px-4 py-1.5 font-mono text-base text-white/80 tabular-nums">
          {drawCount}
          {bankSize > 0 && ` / ${bankSize}`} bolas
        </span>
      </div>

      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* Left: Current ball + History */}
        <div className="flex flex-col gap-6">
          <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-3xl border border-white/15 bg-[#0b0d13] p-8">
            {current ? (
              <div
                key={drawKey}
                className={`animate-bingo-ball-drop flex h-52 w-52 items-center justify-center rounded-full border-4 border-white/80 p-5 text-center shadow-[0_24px_60px_-10px_rgba(0,0,0,0.9)] ${ballColor(
                  drawCount - 1
                )}`}
              >
                <span className="line-clamp-3 font-(family-name:--font-display) text-3xl leading-tight font-bold [overflow-wrap:anywhere] hyphens-auto">
                  {current}
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-4" aria-hidden="true">
                  {BALL_COLORS.map((color, i) => (
                    <span
                      key={color}
                      className={`animate-bingo-tumble h-12 w-12 rounded-full ${color}`}
                      style={{ animationDelay: `${i * 180}ms` }}
                    />
                  ))}
                </div>
                <p className="mt-6 text-xl text-white/65">
                  Esperando la primera bola…
                </p>
              </>
            )}
          </div>

          {previous.length > 0 && (
            <div className="rounded-3xl border border-white/12 bg-[#0b0d13] p-5">
              <p className="font-mono text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
                Ya cantadas ({previous.length})
              </p>
              <ul className="mt-3 flex flex-wrap gap-2.5">
                {previous.map((term, i) => (
                  <li
                    key={`${term}-${i}`}
                    className={`flex h-20 w-20 items-center justify-center rounded-full p-2 text-center ${ballColor(
                      previous.length - 1 - i,
                      true
                    )}`}
                  >
                    <span className="line-clamp-3 text-[0.72rem] leading-tight font-bold [overflow-wrap:anywhere] hyphens-auto">
                      {term}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Winners */}
        <BingoWinnerList winners={winners} prizes={prizes} />
      </div>
    </div>
  );
}

function ProjectorBingoConference({ slug, instance }: Props) {
  const { winners } = useBingoWinners(slug, instance.id);
  const isClosed = instance.state === "closed";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <p className="font-mono text-sm font-semibold tracking-[0.18em] text-green-300 uppercase">
          {isClosed ? "Bingo finalizado" : "Bingo de conferencia"}
        </p>
        <h2 className="mt-1 font-(family-name:--font-display) text-3xl leading-tight font-bold text-white sm:text-5xl">
          {instance.title}
        </h2>
        {!isClosed && (
          <p className="mt-2 text-xl text-white/75">
            Marca tu cartón cuando el speaker mencione un término.
          </p>
        )}
      </div>

      <BingoWinnerList winners={winners} large={isClosed} />
    </div>
  );
}

function BingoWinnerList({
  winners,
  prizes,
  large = false,
}: {
  winners: BingoWinner[];
  prizes?: number;
  large?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/15 bg-[#0b0d13] p-6">
      <p className="font-mono text-xs font-semibold tracking-[0.2em] text-(--ochre) uppercase">
        Ganadores ({winners.length})
      </p>
      {winners.length === 0 ? (
        <p className="mt-4 text-lg text-white/60">Aún no hay ganadores.</p>
      ) : (
        <ol
          className={`mt-4 space-y-3 ${large ? "grid gap-4 space-y-0 sm:grid-cols-2" : ""}`}
        >
          {winners.map((w, i) => (
            <li
              key={w.uid}
              className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 ${
                i === 0
                  ? "border-(--ochre)/55 bg-(--ochre)/12"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ${
                    i === 0
                      ? "bg-(--ochre) text-(--ochre-ink)"
                      : i === 1
                        ? "bg-slate-200 text-slate-950"
                        : i === 2
                          ? "bg-amber-500 text-black"
                          : "bg-white/10 text-white"
                  }`}
                >
                  {i === 0 ? (
                    <CrownIcon size={20} />
                  ) : i < 3 ? (
                    <MedalIcon size={18} />
                  ) : (
                    `#${i + 1}`
                  )}
                </span>
                <span
                  className={`truncate font-semibold text-white ${
                    large ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
                  }`}
                >
                  {w.alias}
                </span>
                {prizes !== undefined && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tracking-wide uppercase ${
                      i < prizes
                        ? "bg-google-green/25 text-green-200"
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    {i < prizes ? "Premio" : "Mención"}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm text-white/55 tabular-nums">
                {formatWinTime(w.bingoWonAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

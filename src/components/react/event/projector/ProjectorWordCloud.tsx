import { useMemo } from "react";
import type { WordCloudConfig } from "../../admin/minigame-templates/types";
import type { LiveInstance } from "../types";
import { useWordCloud } from "../useWordCloud";

const MIN_WC_FONT_REM = 1.5;
const WC_SCALE = 1.35;

const WORD_TONES = [
  "text-(--ochre)",
  "text-white",
  "text-blue-300",
  "text-emerald-300",
  "text-amber-200",
];

function toneForWord(ratio: number, index: number): string {
  if (ratio > 0.78) return "text-(--ochre) font-extrabold";
  if (ratio > 0.5) return "text-white font-bold";
  return `${WORD_TONES[(index % (WORD_TONES.length - 1)) + 1]} font-semibold`;
}

interface Props {
  slug: string;
  instance: LiveInstance;
}

export function ProjectorWordCloud({ slug, instance }: Props) {
  const config = instance.config as unknown as WordCloudConfig | undefined;
  const isClosed = instance.state === "closed";
  const { words } = useWordCloud(slug, instance.id);

  const maxCount = useMemo(
    () => words.reduce((acc, w) => Math.max(acc, w.count), 1),
    [words]
  );
  const totalSubmissions = useMemo(
    () => words.reduce((acc, w) => acc + w.count, 0),
    [words]
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tracking-[0.18em] text-(--ochre) uppercase">
            {isClosed ? "Nube cerrada · Resumen final" : "Nube de palabras"}
          </p>
          <h2 className="mt-1 font-(family-name:--font-display) text-3xl leading-tight font-bold text-white sm:text-5xl">
            {instance.title}
          </h2>
          {config?.prompt && (
            <p className="mt-2 text-xl text-white/75 sm:text-2xl">
              {config.prompt}
            </p>
          )}
        </div>
        <span className="rounded-full border border-white/15 bg-[#0b0d13] px-4 py-1.5 font-mono text-sm text-white/80 tabular-nums">
          {totalSubmissions} aporte{totalSubmissions !== 1 ? "s" : ""} ·{" "}
          {words.length} palabra{words.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-3xl border border-white/12 bg-[#07090e] p-8 sm:p-12">
        {words.length === 0 ? (
          <p className="text-center text-2xl text-white/55">
            Aún no hay palabras enviadas.
          </p>
        ) : (
          <ul className="flex flex-wrap items-baseline justify-center gap-x-8 gap-y-4">
            {words.map((w, index) => {
              const ratio = Math.log(w.count + 1) / Math.log(maxCount + 1);
              const fontSize = Math.max(
                MIN_WC_FONT_REM,
                MIN_WC_FONT_REM + ratio * WC_SCALE * 2
              );
              return (
                <li
                  key={w.id}
                  className={`animate-stage-pop-in tracking-tight ${toneForWord(ratio, index)}`}
                  style={{ fontSize: `${fontSize}rem`, lineHeight: 1.08 }}
                >
                  {w.text}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

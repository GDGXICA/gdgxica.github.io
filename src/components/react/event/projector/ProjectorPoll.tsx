import type { PollConfig } from "../../admin/minigame-templates/types";
import type { LiveInstance } from "../types";
import { useAggregates } from "../useAggregates";

const BAR_COLORS = [
  "bg-google-blue/80",
  "bg-google-green/80",
  "bg-google-yellow/80",
  "bg-google-red/80",
];

interface Props {
  slug: string;
  instance: LiveInstance;
}

export function ProjectorPoll({ slug, instance }: Props) {
  const config = instance.config as unknown as PollConfig;
  const isClosed = instance.state === "closed";
  const questions = config.questions ?? [
    {
      id: "main",
      prompt: config.question ?? "",
      options: config.options ?? [],
    },
  ];
  const currentIndex =
    instance.currentQuestionIndex ?? (config.question ? 0 : -1);
  const question =
    currentIndex >= 0
      ? questions[currentIndex]
      : isClosed
        ? questions[questions.length - 1]
        : undefined;
  const { aggregates } = useAggregates(slug, instance.id);
  const counts = aggregates?.optionCounts ?? {};

  const optionCounts = (question?.options ?? []).map((opt) => ({
    opt,
    count: counts[`${question?.id}:${opt.id}`] ?? 0,
  }));
  const total = optionCounts.reduce((sum, item) => sum + item.count, 0);
  const maxVotes = optionCounts.reduce(
    (max, item) => Math.max(max, item.count),
    0
  );

  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-google-blue font-mono text-sm font-semibold tracking-[0.18em] uppercase">
            {isClosed ? "Resultados finales · " : "Encuesta en vivo · "}
            <span className="text-white/75">{instance.title}</span>
          </p>
          {question && (
            <span className="rounded-full border border-white/15 bg-[#0b0d13] px-4 py-1 font-mono text-sm text-white/75 tabular-nums">
              Pregunta {Math.max(1, currentIndex + 1)} de {questions.length}
            </span>
          )}
        </div>

        {!question ? (
          <p className="mt-12 text-center text-2xl text-white/70 sm:text-3xl">
            Esperando la primera pregunta…
          </p>
        ) : (
          <p className="mt-5 max-w-[28ch] font-(family-name:--font-display) text-3xl leading-[1.08] font-bold tracking-tight text-balance text-white sm:text-5xl lg:text-[3.5rem]">
            {question.prompt}
          </p>
        )}
      </div>

      {question && (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {optionCounts.map(({ opt, count }, idx) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const isLeader = total > 0 && count === maxVotes;
              const barColor = BAR_COLORS[idx % BAR_COLORS.length];

              return (
                <li
                  key={opt.id}
                  className={`relative flex min-h-24 items-center overflow-hidden rounded-2xl border bg-[#0b0d13] px-6 py-5 transition-colors ${
                    isLeader
                      ? "border-white/50 shadow-[0_0_32px_-12px_rgba(255,255,255,0.35)]"
                      : "border-white/12"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 ${barColor} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex w-full items-center justify-between gap-4">
                    <span className="min-w-0 text-2xl font-bold break-words text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] sm:text-3xl">
                      {opt.label}
                    </span>
                    <span className="shrink-0 rounded-xl bg-black/55 px-3.5 py-1.5 font-mono text-xl font-bold text-white tabular-nums sm:text-2xl">
                      {count} · {pct}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="font-mono text-lg text-white/65 tabular-nums">
            {total} respuesta{total !== 1 ? "s" : ""} registradas
          </p>
        </>
      )}
    </div>
  );
}

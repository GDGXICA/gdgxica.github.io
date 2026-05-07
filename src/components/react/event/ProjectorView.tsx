import { useEffect, useMemo, useState } from "react";
import type {
  PollConfig,
  QuizConfig,
  WordCloudConfig,
} from "../admin/minigame-templates/types";
import { useAggregates } from "./useAggregates";
import { useBingoWinners } from "./useBingoWinners";
import { useLiveMinigames } from "./useLiveMinigames";
import { useWordCloud } from "./useWordCloud";
import type { LiveInstance } from "./types";

interface Props {
  slug: string;
  eventName: string;
  joinUrl: string;
  qrSvg: string;
}

export function ProjectorView({ slug, eventName, joinUrl, qrSvg }: Props) {
  const { liveInstances } = useLiveMinigames(slug);
  // Skip realtime instances whose snapshotted config is missing — same
  // guard the participant overlay uses.
  const visible = useMemo(
    () =>
      liveInstances.filter(
        (inst) =>
          inst.mode === "global" || (inst.mode === "realtime" && inst.config)
      ),
    [liveInstances]
  );

  const hasLive = visible.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-4">
        <div>
          <p className="text-xs tracking-widest text-white/50 uppercase">
            GDG ICA · En vivo
          </p>
          <h1 className="text-2xl font-semibold">{eventName}</h1>
        </div>
        <div className="text-right">
          <p className="text-xs tracking-widest text-white/50 uppercase">
            Únete escaneando el QR
          </p>
          <p className="font-mono text-sm text-white/80">{joinUrl}</p>
        </div>
      </header>

      {!hasLive && <HeroQr qrSvg={qrSvg} joinUrl={joinUrl} />}

      {hasLive && (
        <main className="flex-1 p-8">
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(420px,1fr))] gap-6">
            {visible.map((inst) => (
              <article
                key={inst.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur"
              >
                {inst.type === "poll" && inst.config && (
                  <ProjectorPoll slug={slug} instance={inst} />
                )}
                {inst.type === "quiz" && inst.config && (
                  <ProjectorQuiz slug={slug} instance={inst} />
                )}
                {inst.type === "wordcloud" && (
                  <ProjectorWordCloud slug={slug} instance={inst} />
                )}
                {inst.type === "bingo" && (
                  <ProjectorBingo slug={slug} instance={inst} />
                )}
              </article>
            ))}
          </div>
        </main>
      )}

      {hasLive && (
        <footer className="border-t border-white/10 px-8 py-4">
          <div className="flex items-center justify-end gap-4">
            <p className="text-right text-sm text-white/70">
              ¿Recién llegando?
              <br />
              <span className="font-mono text-white">{joinUrl}</span>
            </p>
            <div
              className="h-24 w-24 rounded bg-white p-1"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="QR para unirse"
            />
          </div>
        </footer>
      )}
    </div>
  );
}

export default ProjectorView;

function HeroQr({ qrSvg, joinUrl }: { qrSvg: string; joinUrl: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <p className="text-2xl text-white/70">Escanea para participar</p>
      <div
        className="h-[60vh] max-h-[640px] w-[60vh] max-w-[640px] rounded-2xl bg-white p-6"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
        aria-label="QR de unión"
      />
      <p className="font-mono text-xl text-white/80">{joinUrl}</p>
    </main>
  );
}

// ---- Poll --------------------------------------------------------------

const POLL_QUESTION_ID = "main";

function ProjectorPoll({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const config = instance.config as unknown as PollConfig;
  const { aggregates } = useAggregates(slug, instance.id);
  const counts = aggregates?.optionCounts ?? {};
  const total = config.options.reduce(
    (sum, opt) => sum + (counts[`${POLL_QUESTION_ID}:${opt.id}`] ?? 0),
    0
  );

  return (
    <div>
      <Badge color="blue">Encuesta</Badge>
      <h2 className="mt-3 text-3xl font-bold">{instance.title}</h2>
      <p className="mt-2 text-xl text-white/80">{config.question}</p>
      <ul className="mt-6 space-y-3">
        {config.options.map((opt) => {
          const count = counts[`${POLL_QUESTION_ID}:${opt.id}`] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li
              key={opt.id}
              className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 px-5 py-3"
            >
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-blue-500/40 transition-all"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-xl font-medium">{opt.label}</span>
                <span className="text-lg text-white/80 tabular-nums">
                  {count} · {pct}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-white/60">
        {total} respuesta{total !== 1 && "s"}
      </p>
    </div>
  );
}

// ---- Quiz --------------------------------------------------------------

function ProjectorQuiz({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const config = instance.config as unknown as QuizConfig;
  const { aggregates } = useAggregates(slug, instance.id);
  const startedAt = (
    instance as unknown as {
      currentQuestionStartedAt?: { seconds: number } | null;
    }
  ).currentQuestionStartedAt;
  const idx = instance.currentQuestionIndex ?? -1;
  const question = idx >= 0 ? config.questions[idx] : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!question) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [question]);

  const startedMs = startedAt?.seconds ? startedAt.seconds * 1000 : null;
  const elapsedMs = startedMs ? Math.max(0, now - startedMs) : 0;
  const limitMs = (question?.timeLimitSec ?? 0) * 1000;
  const remainingSec = startedMs
    ? Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000))
    : Math.ceil(limitMs / 1000);

  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = question
    ? question.options.reduce(
        (sum, opt) => sum + (counts[`${question.id}:${opt.id}`] ?? 0),
        0
      )
    : 0;

  return (
    <div>
      <Badge color="purple">Quiz</Badge>
      <h2 className="mt-3 text-3xl font-bold">{instance.title}</h2>

      {!question && (
        <p className="mt-6 text-xl text-white/70">
          Esperando que el organizador inicie la primera pregunta...
        </p>
      )}

      {question && (
        <>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-base text-white/70">
              Pregunta {idx + 1} / {config.questions.length}
            </span>
            <span
              className={`text-2xl font-bold tabular-nums ${
                remainingSec <= 5 ? "text-red-400" : "text-white"
              }`}
              aria-label="Tiempo restante"
            >
              {remainingSec}s
            </span>
          </div>
          <p className="mt-2 text-2xl">{question.prompt}</p>
          <ul className="mt-6 space-y-2">
            {question.options.map((opt) => {
              const count = counts[`${question.id}:${opt.id}`] ?? 0;
              const pct =
                totalForQuestion > 0
                  ? Math.round((count / totalForQuestion) * 100)
                  : 0;
              const isCorrect = opt.id === question.correctOptionId;
              return (
                <li
                  key={opt.id}
                  className={`relative overflow-hidden rounded-xl border px-5 py-3 ${
                    isCorrect
                      ? "border-green-400 bg-black/40"
                      : "border-white/10 bg-black/40"
                  }`}
                >
                  <div
                    aria-hidden
                    className={`absolute inset-y-0 left-0 transition-all ${
                      isCorrect ? "bg-green-500/40" : "bg-purple-500/40"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="text-lg font-medium">
                      {opt.label}
                      {isCorrect && (
                        <span className="ml-2 text-sm text-green-300">
                          Correcto
                        </span>
                      )}
                    </span>
                    <span className="text-base text-white/80 tabular-nums">
                      {count} · {pct}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {aggregates?.leaderboard && aggregates.leaderboard.length > 0 && (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs tracking-widest text-white/50 uppercase">
            Top 10
          </p>
          <ol className="mt-2 space-y-1 text-base">
            {aggregates.leaderboard.map((entry, i) => (
              <li key={entry.uid} className="flex items-center justify-between">
                <span>
                  {i + 1}. {entry.alias}
                </span>
                <span className="tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---- Word cloud ---------------------------------------------------------

const MIN_WC_FONT_REM = 1.4;
const WC_SCALE = 0.9;

function ProjectorWordCloud({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const config = instance.config as unknown as WordCloudConfig | undefined;
  const { words } = useWordCloud(slug, instance.id);
  const maxCount = useMemo(
    () => words.reduce((acc, w) => Math.max(acc, w.count), 1),
    [words]
  );

  return (
    <div>
      <Badge color="amber">Nube de palabras</Badge>
      <h2 className="mt-3 text-3xl font-bold">{instance.title}</h2>
      {config?.prompt && (
        <p className="mt-2 text-xl text-white/80">{config.prompt}</p>
      )}
      <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-6">
        {words.length === 0 ? (
          <p className="text-center text-white/60">
            Aún no hay palabras enviadas.
          </p>
        ) : (
          <ul className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-2">
            {words.map((w) => {
              const ratio = Math.log(w.count + 1) / Math.log(maxCount + 1);
              const fontSize = Math.max(
                MIN_WC_FONT_REM,
                MIN_WC_FONT_REM + ratio * WC_SCALE * 2
              );
              return (
                <li
                  key={w.id}
                  className="text-amber-200"
                  style={{ fontSize: `${fontSize}rem`, lineHeight: 1.1 }}
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

// ---- Bingo --------------------------------------------------------------

function formatWinTime(value: { seconds?: number } | null | undefined): string {
  if (!value?.seconds) return "—";
  return new Date(value.seconds * 1000).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProjectorBingo({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const { winners } = useBingoWinners(slug, instance.id);
  return (
    <div>
      <Badge color="green">Bingo</Badge>
      <h2 className="mt-3 text-3xl font-bold">{instance.title}</h2>
      <p className="mt-2 text-xl text-white/80">
        Marca tu cartón cuando el speaker mencione un término.
      </p>
      <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-6">
        <p className="text-xs tracking-widest text-white/50 uppercase">
          Ganadores
        </p>
        {winners.length === 0 ? (
          <p className="mt-3 text-white/60">Aún no hay ganadores.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-lg">
            {winners.map((w, i) => (
              <li
                key={w.uid}
                className="flex items-center justify-between gap-4"
              >
                <span>
                  <span aria-hidden className="mr-2">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎉"}
                  </span>
                  {w.alias}
                </span>
                <span className="text-sm text-white/60 tabular-nums">
                  {formatWinTime(w.bingoWonAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ---- Shared --------------------------------------------------------------

function Badge({
  color,
  children,
}: {
  color: "blue" | "purple" | "amber" | "green";
  children: React.ReactNode;
}) {
  const palette: Record<typeof color, string> = {
    blue: "bg-blue-500/20 text-blue-200",
    purple: "bg-purple-500/20 text-purple-200",
    amber: "bg-amber-500/20 text-amber-200",
    green: "bg-green-500/20 text-green-200",
  };
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold tracking-widest uppercase ${palette[color]}`}
    >
      {children}
    </span>
  );
}

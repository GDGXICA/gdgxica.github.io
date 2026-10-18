import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type {
  PollConfig,
  QuizConfig,
  WordCloudConfig,
} from "../admin/minigame-templates/types";
import { HeroQr } from "./HeroQr";
import { useAggregates } from "./useAggregates";
import { useBingoWinners, type BingoWinner } from "./useBingoWinners";
import { useLiveMinigames } from "./useLiveMinigames";
import { useGameId } from "./useGameId";
import { useRouletteParticipants } from "./useRouletteParticipants";
import { useWordCloud } from "./useWordCloud";
import type { LiveInstance } from "./types";

interface Props {
  slug: string;
  eventName: string;
  joinUrl: string;

  qrDataUrl: string;
}

export function ProjectorView({ slug, eventName, joinUrl, qrDataUrl }: Props) {
  const { liveInstances } = useLiveMinigames(slug);
  const [qrExpanded, setQrExpanded] = useState(false);
  const gameId = useGameId();
  const selectedJoinUrl = gameId
    ? `${joinUrl}?game=${encodeURIComponent(gameId)}`
    : joinUrl;
  const [qr, setQr] = useState({ url: joinUrl, data: qrDataUrl });
  const [qrError, setQrError] = useState(false);
  const selectedQr = qr.url === selectedJoinUrl ? qr.data : null;

  useEffect(() => {
    let cancelled = false;
    setQrError(false);
    QRCode.toDataURL(selectedJoinUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 512,
    })
      .then((data) => {
        if (!cancelled) setQr({ url: selectedJoinUrl, data });
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedJoinUrl]);

  const visible = useMemo(
    () =>
      liveInstances.filter(
        (inst) =>
          inst.id === gameId &&
          (inst.mode === "global" || (inst.mode === "realtime" && inst.config))
      ),
    [liveInstances, gameId]
  );

  const hasLive = visible.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 px-4 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid grid-cols-2 gap-1.5" aria-hidden="true">
            <span className="bg-google-blue h-3 w-3 rounded-full" />
            <span className="bg-google-red h-3 w-3 rounded-full" />
            <span className="bg-google-yellow h-3 w-3 rounded-full" />
            <span className="bg-google-green h-3 w-3 rounded-full" />
          </span>
          <h1 className="text-xl font-bold sm:text-2xl">{eventName}</h1>
        </div>
        <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <span
            className="bg-google-green h-2.5 w-2.5 rounded-full"
            aria-hidden="true"
          />
          GDG ICA · En vivo
        </p>
      </header>

      {!gameId && (
        <main className="flex-1 p-4 sm:p-8">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Elige una dinámica para proyectar
          </h2>
          <p className="mt-3 text-base text-white/70">
            Enlace para participantes:{" "}
            <span className="break-all text-white">{joinUrl}</span>
          </p>
          {liveInstances.length === 0 && (
            <p className="mt-6 text-xl text-white/75">
              Cuando una dinámica esté en vivo, aparecerá aquí.
            </p>
          )}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {liveInstances.map((item) => (
              <a
                key={item.id}
                href={`?game=${encodeURIComponent(item.id)}`}
                className="rounded-xl bg-white/10 p-6 text-2xl font-bold transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {item.title}
              </a>
            ))}
          </div>
        </main>
      )}
      {gameId && !hasLive && selectedQr && (
        <HeroQr qrDataUrl={selectedQr} url={selectedJoinUrl} />
      )}
      {gameId && !hasLive && !selectedQr && (
        <main className="flex flex-1 items-center justify-center text-xl text-white/70">
          {qrError
            ? "No se pudo generar el QR. Comparte el enlace mostrado arriba."
            : "Preparando QR…"}
        </main>
      )}

      {hasLive && (
        <main className="flex-1 p-4 sm:p-8">
          <div className="grid min-w-0 gap-6">
            {visible.map((inst) => (
              <article
                key={inst.id}
                className="min-w-0 rounded-2xl bg-white/5 p-5 sm:p-8"
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
                {inst.type === "roulette" && (
                  <ProjectorRoulette slug={slug} instance={inst} />
                )}
              </article>
            ))}
          </div>
        </main>
      )}

      {hasLive && (
        <footer className="border-t border-white/15 px-4 py-4 sm:px-8">
          <div className="flex flex-col items-center justify-end gap-4 sm:flex-row sm:gap-5">
            <p className="max-w-full min-w-0 text-center text-base font-semibold text-white/85 sm:text-right">
              ¿Quieres participar? Escanea el QR
              <br />
              <span className="text-xs font-normal break-all text-white/65 sm:text-sm">
                {selectedJoinUrl}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setQrExpanded(true)}
              disabled={!selectedQr}
              className="h-28 w-28 shrink-0 rounded-lg bg-white p-1.5 transition hover:ring-2 hover:ring-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-32 sm:w-32"
              aria-label="Agrandar QR"
            >
              {selectedQr && (
                <img src={selectedQr} alt="" className="h-full w-full" />
              )}
            </button>
          </div>
        </footer>
      )}

      {qrExpanded && selectedQr && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-black/95 p-4 sm:p-8"
          onClick={() => setQrExpanded(false)}
        >
          <button
            type="button"
            onClick={() => setQrExpanded(false)}
            className="absolute top-4 right-4 min-h-11 rounded-lg border border-white/40 px-4 py-2 text-sm text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:top-6 sm:right-8"
            aria-label="Cerrar QR grande"
          >
            ✕ Achicar
          </button>
          <div className="aspect-square w-full max-w-[min(60vh,640px)] rounded-2xl bg-white p-4 sm:p-6">
            <img
              src={selectedQr}
              alt="QR de unión ampliado"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="max-w-full text-center text-sm break-all text-white/85 sm:text-xl">
            {selectedJoinUrl}
          </p>
        </div>
      )}
    </div>
  );
}

export default ProjectorView;

function ProjectorPoll({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const config = instance.config as unknown as PollConfig;
  const questions = config.questions ?? [
    {
      id: "main",
      prompt: config.question ?? "",
      options: config.options ?? [],
    },
  ];
  const currentIndex =
    instance.currentQuestionIndex ?? (config.question ? 0 : -1);
  const question = questions[currentIndex];
  const { aggregates } = useAggregates(slug, instance.id);
  const counts = aggregates?.optionCounts ?? {};
  const total = (question?.options ?? []).reduce(
    (sum, opt) => sum + (counts[`${question?.id}:${opt.id}`] ?? 0),
    0
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-blue-200">{instance.title}</h2>
      {!question && (
        <p className="mt-8 text-2xl text-white/80">
          Esperando la primera pregunta…
        </p>
      )}
      {question && (
        <div className="mt-3">
          <p className="text-base font-semibold text-white/65">
            Pregunta {currentIndex + 1} de {questions.length}
          </p>
          <p className="mt-2 max-w-[28ch] text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            {question.prompt}
          </p>
        </div>
      )}
      <ul className="mt-8 grid gap-3 lg:grid-cols-2">
        {question?.options.map((opt) => {
          const count = counts[`${question.id}:${opt.id}`] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li
              key={opt.id}
              className="relative flex min-h-20 overflow-hidden rounded-xl bg-white/10 px-5 py-4"
            >
              <div
                aria-hidden
                className="bg-google-blue/60 absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex w-full items-center justify-between gap-3">
                <span className="min-w-0 text-xl font-semibold break-words sm:text-2xl">
                  {opt.label}
                </span>
                <span className="shrink-0 text-xl font-bold tabular-nums">
                  {count} · {pct}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-base text-white/70 tabular-nums">
        {total} respuesta{total !== 1 && "s"}
      </p>
    </div>
  );
}

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
  const revealedAnswer = question
    ? aggregates?.revealedAnswers?.[question.id]
    : undefined;

  const counts = aggregates?.optionCounts ?? {};
  const totalForQuestion = question
    ? question.options.reduce(
        (sum, opt) => sum + (counts[`${question.id}:${opt.id}`] ?? 0),
        0
      )
    : 0;

  return (
    <div>
      <h2 className="text-xl font-semibold text-blue-200">{instance.title}</h2>

      {!question && (
        <p className="mt-8 text-2xl text-white/70">
          Esperando que el organizador inicie la primera pregunta...
        </p>
      )}

      {question && (
        <>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-base font-semibold text-white/70">
              Pregunta {idx + 1} de {config.questions.length}
            </span>
            <span
              className={`rounded-xl px-4 py-2 text-3xl font-black tabular-nums ${
                remainingSec <= 5
                  ? "bg-red-500/20 text-red-200"
                  : "bg-white/10 text-white"
              }`}
              aria-label="Tiempo restante"
            >
              {remainingSec}s
            </span>
          </div>
          <p className="mt-5 max-w-[28ch] text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            {question.prompt}
          </p>
          <ul className="mt-8 grid gap-3 lg:grid-cols-2">
            {question.options.map((opt, index) => {
              const count = counts[`${question.id}:${opt.id}`] ?? 0;
              const pct =
                totalForQuestion > 0
                  ? Math.round((count / totalForQuestion) * 100)
                  : 0;
              const isCorrect = opt.id === revealedAnswer;
              const revealCorrect = Boolean(revealedAnswer) && isCorrect;
              const optionColors = [
                "bg-google-blue text-white",
                "bg-google-red text-white",
                "bg-google-yellow text-gray-950",
                "bg-google-green text-white",
              ];
              return (
                <li
                  key={opt.id}
                  className={`relative flex min-h-20 overflow-hidden rounded-xl px-5 py-4 ${optionColors[index % optionColors.length]} ${revealCorrect ? "outline-4 outline-offset-2 outline-white" : ""} ${revealedAnswer && !isCorrect ? "opacity-55" : ""}`}
                >
                  <div className="relative flex w-full items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3 text-xl font-semibold sm:text-2xl">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/60 text-base"
                        aria-hidden="true"
                      >
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="break-words">{opt.label}</span>
                      {revealCorrect && (
                        <span className="text-base">✓ Correcto</span>
                      )}
                    </span>
                    {revealedAnswer && (
                      <span className="shrink-0 text-lg font-bold tabular-nums">
                        {count} · {pct}%
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {revealedAnswer &&
        aggregates?.leaderboard &&
        aggregates.leaderboard.length > 0 && (
          <div className="mt-8 border-t border-white/20 pt-5">
            <h3 className="text-xl font-bold">Clasificación</h3>
            <ol className="mt-3 grid gap-2 text-lg sm:grid-cols-2">
              {aggregates.leaderboard.map((entry, i) => (
                <li
                  key={entry.uid}
                  className="flex items-center justify-between gap-4 rounded-lg bg-white/10 px-4 py-2"
                >
                  <span>
                    {i + 1}. {entry.alias}
                  </span>
                  <span className="font-bold tabular-nums">{entry.score}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
    </div>
  );
}

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

function formatWinTime(value: { seconds?: number } | null | undefined): string {
  if (!value?.seconds) return "—";
  return new Date(value.seconds * 1000).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BALL_COLORS = [
  "bg-google-blue",
  "bg-google-red",
  "bg-google-yellow",
  "bg-google-green",
];

const BALL_COLORS_SOFT = [
  "bg-google-blue/70",
  "bg-google-red/70",
  "bg-google-yellow/70",
  "bg-google-green/70",
];

function ballColor(index: number, soft = false): string {
  const palette = soft ? BALL_COLORS_SOFT : BALL_COLORS;
  const n = palette.length;
  return palette[((index % n) + n) % n];
}

function ProjectorBingo({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  if (instance.config?.classic === true) {
    return <ProjectorBingoClassic slug={slug} instance={instance} />;
  }
  return <ProjectorBingoConference slug={slug} instance={instance} />;
}

function ProjectorBingoClassic({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const { winners } = useBingoWinners(slug, instance.id);
  const prizes = (instance.config?.prizes as number | undefined) ?? 3;
  const bankSize =
    (instance.config?.terms as string[] | undefined)?.length ?? 0;

  const drawn = instance.drawnTerms ?? [];
  const drawCount = instance.drawCount ?? drawn.length;
  const current = instance.lastDrawnTerm ?? null;

  const drawKey = `${instance.lastDrawAt?.seconds ?? 0}-${drawCount}`;
  const previous = useMemo(() => drawn.slice(0, -1).reverse(), [drawn]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <Badge color="green">Bingo clásico</Badge>
        <span className="text-lg text-white/70 tabular-nums">
          {drawCount}
          {bankSize > 0 && ` / ${bankSize}`} bolas
        </span>
      </div>
      <h2 className="mt-3 text-3xl font-bold">{instance.title}</h2>

      <div className="mt-6 flex min-h-[15rem] flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/40 p-6">
        {current ? (
          <div
            key={drawKey}
            className={`animate-bingo-ball-drop flex h-44 w-44 items-center justify-center rounded-full ${ballColor(
              drawCount - 1
            )} p-4 text-center shadow-2xl`}
          >
            <span className="text-2xl leading-tight font-extrabold break-words text-white drop-shadow">
              {current}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-4" aria-hidden>
              {BALL_COLORS.map((color, i) => (
                <span
                  key={color}
                  className={`animate-bingo-tumble h-12 w-12 rounded-full ${color}`}
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
            <p className="mt-6 text-xl text-white/70">
              Esperando la primera bola...
            </p>
          </>
        )}
      </div>

      {previous.length > 0 && (
        <div className="mt-6">
          <p className="text-xs tracking-widest text-white/50 uppercase">
            Ya cantadas
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {previous.map((term, i) => (
              <li
                key={`${term}-${i}`}
                className={`flex h-20 w-20 items-center justify-center rounded-full ${ballColor(
                  previous.length - 1 - i,
                  true
                )} p-2 text-center`}
              >
                <span className="text-[0.7rem] leading-tight font-bold break-words text-white">
                  {term}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BingoWinnerList winners={winners} prizes={prizes} />
    </div>
  );
}

function ProjectorBingoConference({
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
      <BingoWinnerList winners={winners} />
    </div>
  );
}

function BingoWinnerList({
  winners,
  prizes,
}: {
  winners: BingoWinner[];
  prizes?: number;
}) {
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-6">
      <p className="text-xs tracking-widest text-white/50 uppercase">
        Ganadores
      </p>
      {winners.length === 0 ? (
        <p className="mt-3 text-white/60">Aún no hay ganadores.</p>
      ) : (
        <ol className="mt-3 space-y-2 text-lg">
          {winners.map((w, i) => (
            <li key={w.uid} className="flex items-center justify-between gap-4">
              <span>
                <span aria-hidden className="mr-2">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎉"}
                </span>
                {w.alias}
                {prizes !== undefined && (
                  <span
                    className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                      i < prizes
                        ? "bg-google-green/25 text-green-200"
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    {i < prizes ? "Premio" : "Mención"}
                  </span>
                )}
              </span>
              <span className="text-sm text-white/60 tabular-nums">
                {formatWinTime(w.bingoWonAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const SPIN_DURATION_MS = 4000;

function ProjectorRoulette({
  slug,
  instance,
}: {
  slug: string;
  instance: LiveInstance;
}) {
  const { eligible, winners, loading } = useRouletteParticipants(
    slug,
    instance.id
  );
  const prize = instance.config?.prize as string | undefined;
  const eligiblePool = useMemo(
    () => [...eligible].sort((a, b) => a.uid.localeCompare(b.uid)),
    [eligible]
  );
  const winnerEntry = [...eligible, ...winners].find(
    (entry) => entry.uid === instance.lastSpinWinnerId
  );
  const [wheelEntries, setWheelEntries] = useState(eligiblePool);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const lastSpinAt = instance.lastSpinAt;
  const lastSpinWinnerId = instance.lastSpinWinnerId;
  const spinKey = lastSpinAt
    ? `${lastSpinAt.seconds}:${lastSpinAt.nanoseconds ?? 0}`
    : null;
  const lastSpinRef = useRef(spinKey);
  const initialWheelAlignedRef = useRef(false);
  const spinFrameRef = useRef<number | null>(null);
  const spinTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      if (spinTimeoutRef.current !== null)
        window.clearTimeout(spinTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    setReducedMotion(media.matches);
    const change = () => setReducedMotion(media.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);

  useEffect(() => {
    if (!spinning && !lastSpinWinnerId) setWheelEntries(eligiblePool);
  }, [eligiblePool, spinning, lastSpinWinnerId]);

  useEffect(() => {
    if (
      initialWheelAlignedRef.current ||
      !spinKey ||
      spinKey !== lastSpinRef.current ||
      !lastSpinWinnerId ||
      !winnerEntry
    )
      return;
    const entries = [
      ...eligiblePool.filter((entry) => entry.uid !== lastSpinWinnerId),
      winnerEntry,
    ].sort((a, b) => a.uid.localeCompare(b.uid));
    const index = entries.findIndex((entry) => entry.uid === lastSpinWinnerId);
    if (index < 0) return;
    setWheelEntries(entries);
    setRotation(-((index + 0.5) * (360 / entries.length)));
    initialWheelAlignedRef.current = true;
  }, [spinKey, lastSpinWinnerId, eligiblePool, winnerEntry]);

  useEffect(() => {
    if (
      !spinKey ||
      spinKey === lastSpinRef.current ||
      !lastSpinWinnerId ||
      !winnerEntry
    )
      return;
    lastSpinRef.current = spinKey;
    initialWheelAlignedRef.current = true;
    const nextEntries = [
      ...eligiblePool.filter((entry) => entry.uid !== lastSpinWinnerId),
      winnerEntry,
    ].sort((a, b) => a.uid.localeCompare(b.uid));
    const index = nextEntries.findIndex(
      (entry) => entry.uid === lastSpinWinnerId
    );
    if (index < 0) return;
    if (spinFrameRef.current !== null)
      cancelAnimationFrame(spinFrameRef.current);
    if (spinTimeoutRef.current !== null)
      window.clearTimeout(spinTimeoutRef.current);
    setWheelEntries(nextEntries);
    setSpinning(!reducedMotion);
    const step = 360 / nextEntries.length;
    const target = -((index + 0.5) * step);
    spinFrameRef.current = requestAnimationFrame(() =>
      setRotation(
        (current) =>
          current +
          (reducedMotion ? 0 : 1800) +
          ((((target - current) % 360) + 360) % 360)
      )
    );
    spinTimeoutRef.current = reducedMotion
      ? null
      : window.setTimeout(() => setSpinning(false), SPIN_DURATION_MS);
  }, [spinKey, lastSpinWinnerId, eligiblePool, winnerEntry, reducedMotion]);

  const wheel = wheelEntries.length > 0 ? wheelEntries : eligiblePool;
  const step = wheel.length > 0 ? 360 / wheel.length : 360;
  const palette = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];
  const segments =
    wheel.length > 0
      ? wheel
          .map(
            (_, index) =>
              `${palette[index % 4]} ${index * step}deg ${(index + 1) * step}deg`
          )
          .join(", ")
      : "#374151 0deg 360deg";
  const displayedWinner = winnerEntry?.alias ?? null;

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
        {instance.title}
      </h2>
      {prize && <p className="mt-2 text-xl text-white/75">Premio: {prize}</p>}

      <div className="mt-7 flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-12">
        <div
          className="relative aspect-square w-full max-w-[min(64vh,520px)]"
          aria-label={`Ruleta con ${wheel.length} participantes`}
        >
          <svg
            className="absolute top-0 left-1/2 z-20 w-10 -translate-x-1/2 -translate-y-1/4 drop-shadow-lg"
            viewBox="0 0 40 44"
            aria-hidden="true"
          >
            <path d="M20 44 0 0h40Z" fill="white" />
          </svg>
          <div
            className="absolute inset-2 rounded-full border-[10px] border-white shadow-[0_18px_40px_-10px_rgba(0,0,0,.7)] motion-reduce:transition-none"
            style={{
              background: `conic-gradient(${segments})`,
              transform: `rotate(${rotation}deg)`,
              transition: spinning
                ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(.12,.75,.1,1)`
                : "none",
            }}
          >
            {wheel.length <= 20 &&
              wheel.map((entry, index) => (
                <span
                  key={entry.uid}
                  className="absolute top-1/2 left-1/2 max-w-[35%] truncate text-sm font-bold text-white drop-shadow-[0_1px_2px_black]"
                  style={{
                    transform: `rotate(${(index + 0.5) * step}deg) translateY(calc(-1 * clamp(90px, 16vw, 180px))) rotate(-${(index + 0.5) * step}deg)`,
                  }}
                >
                  {entry.alias}
                </span>
              ))}
          </div>
          <div className="absolute top-1/2 left-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,.65)] sm:h-24 sm:w-24">
            <span className="grid grid-cols-2 gap-1.5" aria-hidden="true">
              <span className="bg-google-blue h-3 w-3 rounded-full" />
              <span className="bg-google-red h-3 w-3 rounded-full" />
              <span className="bg-google-yellow h-3 w-3 rounded-full" />
              <span className="bg-google-green h-3 w-3 rounded-full" />
            </span>
          </div>
        </div>
        <div className="w-full max-w-sm text-center lg:text-left">
          {loading ? (
            <p className="text-xl">Cargando participantes…</p>
          ) : spinning ? (
            <p className="text-3xl font-bold" role="status">
              ¡La ruleta está girando!
            </p>
          ) : displayedWinner ? (
            <>
              <p className="text-xl text-white/75">
                Ganó el giro #{instance.spinCount}
              </p>
              <p
                className="mt-3 text-5xl leading-tight font-black break-words text-green-300 sm:text-6xl"
                aria-live="polite"
              >
                {displayedWinner}
              </p>
            </>
          ) : (
            <p className="text-2xl font-semibold tabular-nums">
              {eligible.length} participantes en la ruleta
            </p>
          )}
          {wheel.length > 20 && (
            <p className="mt-4 text-base text-white/70">
              {wheel.length} segmentos · ganador destacado al terminar
            </p>
          )}
        </div>
      </div>

      {winners.length > 0 && (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs tracking-widest text-white/50 uppercase">
            Ganadores
          </p>
          <ol className="mt-2 space-y-1 text-base">
            {winners.map((w, i) => (
              <li key={w.uid} className="flex items-center justify-between">
                <span>
                  <span aria-hidden className="mr-2">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎉"}
                  </span>
                  {w.alias}
                </span>
                <span className="text-sm text-white/60">
                  #{w.rouletteSpinNumber}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "blue" | "purple" | "amber" | "green" | "rose";
  children: React.ReactNode;
}) {
  const palette: Record<typeof color, string> = {
    blue: "bg-blue-500/20 text-blue-200",
    purple: "bg-purple-500/20 text-purple-200",
    amber: "bg-amber-500/20 text-amber-200",
    green: "bg-green-500/20 text-green-200",
    rose: "bg-rose-500/20 text-rose-200",
  };
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold tracking-widest uppercase ${palette[color]}`}
    >
      {children}
    </span>
  );
}

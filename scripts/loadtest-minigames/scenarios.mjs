import { setTimeout as delay } from "node:timers/promises";
import { MetricsRecorder, printReport, writeLine } from "./metrics.mjs";
import { runWithConcurrency, waitUntil } from "./client.mjs";

async function fireBurst(users, burstMs, concurrency, task) {
  const burstStart = Date.now();
  const total = Math.max(1, users.length);
  return runWithConcurrency(users, concurrency, async (user, idx) => {
    if (burstMs > 0) {
      const targetAt = burstStart + Math.floor((idx / total) * burstMs);
      const waitMs = targetAt - Date.now();
      if (waitMs > 0) await delay(waitMs);
    }
    return task(user, idx);
  });
}

export async function runRouletteScenario(ctx) {
  const { adapter, admin, users, slug, pauseIfNeeded, webOrigin, concurrency } =
    ctx;
  const tplId = await adapter.createTemplate(admin.idToken, {
    type: "roulette",
    title: "Sandbox Ruleta 200",
    description: "Prueba de carga ruleta",
    roulette: { prize: "Premio Sandbox" },
  });
  const instanceId = await adapter.attachAndGoLive(
    admin.idToken,
    slug,
    tplId,
    0
  );

  writeLine(
    `Ruleta lista -> Participante: ${webOrigin}/events/${slug}/jugar?game=${instanceId}`
  );
  writeLine(
    `                Proyector:    ${webOrigin}/events/${slug}/projector?game=${instanceId}`
  );
  await pauseIfNeeded(
    "Abre la ruleta en tu navegador y presiona Enter para iniciar la ráfaga de 200 usuarios"
  );

  const joinMetrics = new MetricsRecorder("roulette /join");
  const spinMetrics = new MetricsRecorder("roulette /spin");
  const winners = [];

  const firstWave = users.slice(0, Math.floor(users.length * 0.75));
  const secondWave = users.slice(Math.floor(users.length * 0.75));

  await fireBurst(firstWave, 1200, concurrency, async (user) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/join`,
      user.idToken,
      { alias: user.alias, instanceId },
      15_000,
      2
    );
    joinMetrics.record(res);
    return res;
  });

  const concurrentSpinsAndJoins = await Promise.all([
    fireBurst(secondWave, 1000, concurrency, async (user) => {
      const res = await adapter.apiRequest(
        "POST",
        `/events/${encodeURIComponent(slug)}/minigames/join`,
        user.idToken,
        { alias: user.alias, instanceId },
        15_000,
        2
      );
      joinMetrics.record(res);
      return res;
    }),
    (async () => {
      await delay(200);
      const [s1, s2] = await Promise.all([
        adapter.apiRequest(
          "POST",
          `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/roulette/spin`,
          admin.idToken
        ),
        adapter.apiRequest(
          "POST",
          `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/roulette/spin`,
          admin.idToken
        ),
      ]);
      spinMetrics.record(s1);
      spinMetrics.record(s2);
      if (s1.ok && s1.data?.winnerId) winners.push(s1.data.winnerId);
      if (s2.ok && s2.data?.winnerId) winners.push(s2.data.winnerId);
    })(),
  ]);
  void concurrentSpinsAndJoins;

  const s3 = await adapter.apiRequest(
    "POST",
    `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/roulette/spin`,
    admin.idToken
  );
  spinMetrics.record(s3);
  if (s3.ok && s3.data?.winnerId) winners.push(s3.data.winnerId);

  const expectedWinners = winners.length;
  const expectedEligible = users.length - expectedWinners;
  const aggTimeoutMs = ctx.target === "emulator" ? 25_000 : 10_000;
  const converged = await waitUntil(
    async () => {
      const agg = await adapter.readDocument(
        `events/${slug}/minigames/${instanceId}/aggregates/current`,
        admin.idToken
      );
      const total = agg?.totalParticipants ?? 0;
      const eligible = agg?.eligibleCount ?? -1;
      const aggWinners = Array.isArray(agg?.winners) ? agg.winners.length : 0;
      return {
        done:
          total >= users.length &&
          eligible === expectedEligible &&
          aggWinners === expectedWinners,
        agg,
      };
    },
    aggTimeoutMs,
    300
  );

  await adapter.closeInstance(admin.idToken, slug, instanceId);

  const uniqueWinners = new Set(winners).size;
  const checks = [
    {
      name: "Zero server errors on /join",
      passed: joinMetrics.summary().serverErrors === 0,
      detail: `serverErrors=${joinMetrics.summary().serverErrors}`,
    },
    {
      name: "Zero server errors on concurrent /spin",
      passed: spinMetrics.summary().serverErrors === 0,
      detail: `serverErrors=${spinMetrics.summary().serverErrors}`,
    },
    {
      name: "No duplicate roulette winners under concurrent spins",
      passed: expectedWinners === 3 && uniqueWinners === expectedWinners,
      detail: `winners=${expectedWinners}, unique=${uniqueWinners}`,
    },
    {
      name: "Roulette aggregate converged to exact counts",
      passed: Boolean(converged.done),
      detail: `total=${converged.agg?.totalParticipants ?? 0}/${users.length}, eligible=${converged.agg?.eligibleCount ?? -1}/${expectedEligible}, winners=${converged.agg?.winners?.length ?? 0}/${expectedWinners}`,
    },
  ];

  printReport("RULETA (200 usuarios)", [joinMetrics, spinMetrics], checks);
  return checks.every((c) => c.passed);
}

export async function runPollScenario(ctx) {
  const { adapter, admin, users, slug, pauseIfNeeded, webOrigin, concurrency } =
    ctx;
  const tplId = await adapter.createTemplate(admin.idToken, {
    type: "poll",
    title: "Sandbox Encuesta 200",
    description: "Prueba de carga encuesta",
    poll: {
      questions: [
        {
          id: "q1",
          prompt: "¿Qué stack prefieres en Android/Web?",
          options: [
            { id: "a", label: "Flutter" },
            { id: "b", label: "Kotlin" },
            { id: "c", label: "Astro + React" },
            { id: "d", label: "Angular" },
          ],
        },
        {
          id: "q2",
          prompt: "¿Qué charla te gustó más?",
          options: [
            { id: "a", label: "AI / Gemini" },
            { id: "b", label: "Cloud" },
            { id: "c", label: "Mobile" },
          ],
        },
        {
          id: "q3",
          prompt: "¿Volverías al próximo DevFest?",
          options: [
            { id: "a", label: "Sí, de todas maneras" },
            { id: "b", label: "Probablemente" },
          ],
        },
      ],
    },
  });
  const instanceId = await adapter.attachAndGoLive(
    admin.idToken,
    slug,
    tplId,
    1
  );

  writeLine(
    `Encuesta lista -> Participante: ${webOrigin}/events/${slug}/jugar?game=${instanceId}`
  );
  writeLine(
    `                  Proyector:    ${webOrigin}/events/${slug}/projector?game=${instanceId}`
  );
  await pauseIfNeeded(
    "Abre la encuesta en tu navegador y presiona Enter para unir 200 usuarios y lanzar P1"
  );

  const joinMetrics = new MetricsRecorder("poll /join");
  const q1Metrics = new MetricsRecorder("poll Q1 /answer (burst)");
  const q2Metrics = new MetricsRecorder("poll Q2 /answer + dup");
  const q3Metrics = new MetricsRecorder("poll Q3 /answer (burst)");

  await fireBurst(users, 1000, concurrency, async (user) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/join`,
      user.idToken,
      { alias: user.alias, instanceId },
      15_000,
      2
    );
    joinMetrics.record(res);
  });

  await adapter.apiRequest(
    "POST",
    `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/advance`,
    admin.idToken
  );

  const q1Opts = ["a", "b", "c", "d"];
  await fireBurst(users, 1500, concurrency, async (user, idx) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/answer`,
      user.idToken,
      { questionId: "q1", optionId: q1Opts[idx % q1Opts.length] },
      15_000,
      2
    );
    q1Metrics.record(res);
  });

  const aggTimeoutMs = ctx.target === "emulator" ? 25_000 : 10_000;
  const q1Converged = await waitUntil(
    async () => {
      const agg = await adapter.readDocument(
        `events/${slug}/minigames/${instanceId}/aggregates/current`,
        admin.idToken
      );
      const counts = agg?.optionCounts ?? {};
      const sum = q1Opts.reduce(
        (acc, id) => acc + (counts[`q1:${id}`] ?? 0),
        0
      );
      return { done: sum >= users.length, sum };
    },
    aggTimeoutMs,
    300
  );

  await pauseIfNeeded(
    "P1 lista. Presiona Enter para probar P2 (dobles votos + cambio rápido a P3)"
  );

  await adapter.apiRequest(
    "POST",
    `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/advance`,
    admin.idToken
  );

  const q2Opts = ["a", "b", "c"];
  const duplicateSample = users.slice(0, 20);
  const q2FirstBatch = users.slice(0, users.length - 25);
  const q2LateBatch = users.slice(users.length - 25);

  await fireBurst(q2FirstBatch, 600, concurrency, async (user, idx) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/answer`,
      user.idToken,
      { questionId: "q2", optionId: q2Opts[idx % q2Opts.length] },
      15_000,
      2
    );
    q2Metrics.record(res);
  });

  const dupResults = await runWithConcurrency(
    duplicateSample,
    Math.min(20, concurrency),
    async (user) => {
      const res = await adapter.apiRequest(
        "POST",
        `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/answer`,
        user.idToken,
        { questionId: "q2", optionId: "b" },
        15_000,
        2
      );
      q2Metrics.record(res);
      return res;
    }
  );

  await Promise.all([
    adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/advance`,
      admin.idToken
    ),
    fireBurst(q2LateBatch, 300, concurrency, async (user, idx) => {
      const res = await adapter.apiRequest(
        "POST",
        `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/answer`,
        user.idToken,
        { questionId: "q2", optionId: q2Opts[idx % q2Opts.length] },
        15_000,
        2
      );
      q2Metrics.record(res);
    }),
  ]);

  const q3Opts = ["a", "b"];
  await fireBurst(users, 1500, concurrency, async (user, idx) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/poll/answer`,
      user.idToken,
      { questionId: "q3", optionId: q3Opts[idx % q3Opts.length] },
      15_000,
      2
    );
    q3Metrics.record(res);
  });

  const q3Converged = await waitUntil(
    async () => {
      const agg = await adapter.readDocument(
        `events/${slug}/minigames/${instanceId}/aggregates/current`,
        admin.idToken
      );
      const counts = agg?.optionCounts ?? {};
      const sum = q3Opts.reduce(
        (acc, id) => acc + (counts[`q3:${id}`] ?? 0),
        0
      );
      return { done: sum >= users.length, sum };
    },
    aggTimeoutMs,
    300
  );

  await adapter.closeInstance(admin.idToken, slug, instanceId);

  const dup409 = dupResults.filter((r) => r.status === 409).length;
  const checks = [
    {
      name: "Zero server errors across poll /join and /answer",
      passed:
        joinMetrics.summary().serverErrors === 0 &&
        q1Metrics.summary().serverErrors === 0 &&
        q2Metrics.summary().serverErrors === 0 &&
        q3Metrics.summary().serverErrors === 0,
      detail: `5xx=${joinMetrics.summary().serverErrors + q1Metrics.summary().serverErrors + q2Metrics.summary().serverErrors + q3Metrics.summary().serverErrors}`,
    },
    {
      name: "Duplicate votes rejected atomically with 409",
      passed: dup409 === duplicateSample.length,
      detail: `409=${dup409}/${duplicateSample.length}`,
    },
    {
      name: "Q1 sharded aggregate converged to exact total",
      passed: Boolean(q1Converged.done),
      detail: `q1Sum=${q1Converged.sum ?? 0}/${users.length}`,
    },
    {
      name: "Q3 sharded aggregate converged to exact total",
      passed: Boolean(q3Converged.done),
      detail: `q3Sum=${q3Converged.sum ?? 0}/${users.length}`,
    },
  ];

  printReport(
    "ENCUESTA (200 usuarios)",
    [joinMetrics, q1Metrics, q2Metrics, q3Metrics],
    checks
  );
  return checks.every((c) => c.passed);
}

export async function runQuizScenario(ctx) {
  const {
    adapter,
    admin,
    users,
    slug,
    pauseIfNeeded,
    webOrigin,
    quizLimitSec,
    concurrency,
  } = ctx;
  const tplId = await adapter.createTemplate(admin.idToken, {
    type: "quiz",
    title: "Sandbox Quiz 200",
    description: "Prueba de carga quiz",
    quiz: {
      questions: [
        {
          id: "q1",
          prompt: "¿Cuál es la base de datos en tiempo real de Firebase?",
          options: [
            { id: "a", label: "Cloud Firestore" },
            { id: "b", label: "BigQuery" },
            { id: "c", label: "Cloud SQL" },
            { id: "d", label: "Spanner" },
          ],
          correctOptionId: "a",
          timeLimitSec: quizLimitSec,
          points: 100,
        },
        {
          id: "q2",
          prompt: "¿Qué herramienta construye sitios estáticos con islas?",
          options: [
            { id: "a", label: "Astro" },
            { id: "b", label: "Webpack" },
            { id: "c", label: "Express" },
            { id: "d", label: "Jest" },
          ],
          correctOptionId: "a",
          timeLimitSec: quizLimitSec,
          points: 100,
        },
      ],
    },
  });
  const instanceId = await adapter.attachAndGoLive(
    admin.idToken,
    slug,
    tplId,
    2
  );

  writeLine(
    `Quiz listo -> Participante: ${webOrigin}/events/${slug}/jugar?game=${instanceId}`
  );
  writeLine(
    `              Proyector:    ${webOrigin}/events/${slug}/projector?game=${instanceId}`
  );
  await pauseIfNeeded(
    "Abre el quiz en tu navegador y presiona Enter para unir 200 usuarios e iniciar P1"
  );

  const joinMetrics = new MetricsRecorder("quiz /join");
  const q1Metrics = new MetricsRecorder("quiz Q1 /answer");
  const lateMetrics = new MetricsRecorder("quiz Q1 late /answer");
  const finishAdvanceMetrics = new MetricsRecorder("quiz Q1->Q2 finish+adv");
  const q2Metrics = new MetricsRecorder("quiz Q2 /answer");

  await fireBurst(users, 1000, concurrency, async (user) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/join`,
      user.idToken,
      { alias: user.alias, instanceId },
      15_000,
      2
    );
    joinMetrics.record(res);
  });

  const startQ1 = await adapter.apiRequest(
    "POST",
    `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/quiz/advance`,
    admin.idToken
  );
  if (!startQ1.ok) {
    throw new Error(
      `Quiz Q1 start failed (${startQ1.status}): ${startQ1.error}`
    );
  }
  const serverStartedSec = startQ1.data?.currentQuestionStartedAt?.seconds;
  const serverStartedNanos =
    startQ1.data?.currentQuestionStartedAt?.nanoseconds ?? 0;
  const q1StartedAtMs =
    typeof serverStartedSec === "number"
      ? serverStartedSec * 1000 + Math.ceil(serverStartedNanos / 1_000_000)
      : Date.now();

  const onTimeCount = Math.max(1, users.length - 10);
  const onTimeUsers = users.slice(0, onTimeCount);
  const lateUsers = users.slice(onTimeCount);
  const q1Opts = ["a", "b", "c", "d"];

  const burstWindowMs = Math.min(
    2000,
    Math.max(500, (quizLimitSec - 6) * 1000)
  );
  const q1Results = await fireBurst(
    onTimeUsers,
    burstWindowMs,
    concurrency,
    async (user, idx) => {
      const res = await adapter.apiRequest(
        "POST",
        `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/quiz/answer`,
        user.idToken,
        { questionId: "q1", optionId: q1Opts[idx % q1Opts.length] },
        15_000,
        2
      );
      q1Metrics.record(res);
      return res;
    }
  );
  const acceptedQ1 = q1Results.filter((r) => r.ok).length;

  const remainingToDeadline =
    q1StartedAtMs + quizLimitSec * 1000 + 800 - Date.now();
  if (remainingToDeadline > 0) await delay(remainingToDeadline);

  const lateResults = await runWithConcurrency(lateUsers, 10, async (user) => {
    const res = await adapter.apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/quiz/answer`,
      user.idToken,
      { questionId: "q1", optionId: "a" }
    );
    lateMetrics.record(res);
    return res;
  });

  const advanceToQ2 = await adapter.apiRequest(
    "POST",
    `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/quiz/advance`,
    admin.idToken,
    undefined,
    30_000
  );
  finishAdvanceMetrics.record(advanceToQ2);

  const q1Agg = await waitUntil(
    async () => {
      const agg = await adapter.readDocument(
        `events/${slug}/minigames/${instanceId}/aggregates/current`,
        admin.idToken
      );
      const revealed = agg?.revealedAnswers?.q1;
      const counts = agg?.optionCounts ?? {};
      const sum = q1Opts.reduce(
        (acc, id) => acc + (counts[`q1:${id}`] ?? 0),
        0
      );
      const leaderboard = Array.isArray(agg?.leaderboard)
        ? agg.leaderboard
        : [];
      return {
        done: revealed === "a" && sum === acceptedQ1 && leaderboard.length > 0,
        revealed,
        sum,
        leaderboardCount: leaderboard.length,
      };
    },
    5000,
    250
  );

  await pauseIfNeeded(
    "P2 en curso. Presiona Enter para disparar las 200 respuestas de P2"
  );

  await fireBurst(
    users,
    Math.min(2000, Math.max(500, (quizLimitSec - 6) * 1000)),
    concurrency,
    async (user, idx) => {
      const res = await adapter.apiRequest(
        "POST",
        `/events/${encodeURIComponent(slug)}/minigames/${instanceId}/quiz/answer`,
        user.idToken,
        { questionId: "q2", optionId: q1Opts[idx % q1Opts.length] },
        15_000,
        2
      );
      q2Metrics.record(res);
    }
  );

  await adapter.closeInstance(admin.idToken, slug, instanceId);

  const expiredRejected = lateResults.filter((r) => r.status === 400).length;
  const checks = [
    {
      name: "Zero server errors across quiz /join, /answer and /advance",
      passed:
        joinMetrics.summary().serverErrors === 0 &&
        q1Metrics.summary().serverErrors === 0 &&
        finishAdvanceMetrics.summary().serverErrors === 0 &&
        q2Metrics.summary().serverErrors === 0,
      detail: `5xx=${joinMetrics.summary().serverErrors + q1Metrics.summary().serverErrors + finishAdvanceMetrics.summary().serverErrors + q2Metrics.summary().serverErrors}`,
    },
    {
      name: "All on-time Q1 answers accepted before deadline",
      passed: acceptedQ1 === onTimeCount,
      detail: `accepted=${acceptedQ1}/${onTimeCount}`,
    },
    {
      name: "Late answers rejected after deadline (400 expired)",
      passed: expiredRejected === lateUsers.length,
      detail: `rejected=${expiredRejected}/${lateUsers.length}`,
    },
    {
      name: "Q1->Q2 advance succeeded without deadlock (inline WriteBatch scoring)",
      passed: advanceToQ2.ok,
      detail: `status=${advanceToQ2.status}, latency=${Math.round(advanceToQ2.latencyMs)}ms`,
    },
    {
      name: "Q1 answer revealed, optionCounts exact and top-10 leaderboard populated",
      passed: Boolean(q1Agg.done),
      detail: `revealed=${q1Agg.revealed ?? "none"}, sum=${q1Agg.sum ?? 0}/${acceptedQ1}, leaderboard=${q1Agg.leaderboardCount ?? 0}`,
    },
  ];

  printReport(
    "QUIZ (200 usuarios)",
    [joinMetrics, q1Metrics, lateMetrics, finishAdvanceMetrics, q2Metrics],
    checks
  );
  return checks.every((c) => c.passed);
}

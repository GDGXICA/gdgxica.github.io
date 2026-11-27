import process from "node:process";
import readline from "node:readline/promises";
import { createSandboxAdapter } from "./client.mjs";
import { writeLine } from "./metrics.mjs";
import {
  runPollScenario,
  runQuizScenario,
  runRouletteScenario,
} from "./scenarios.mjs";

function parseArgs(argv) {
  const args = {
    target: "emulator",
    users: 200,
    slug: "sandbox-loadtest",
    games: ["roulette", "poll", "quiz"],
    pause: false,
    confirmProd: false,
    quizLimitSec: 15,
    concurrency: undefined,
    adminToken: process.env.LOADTEST_ADMIN_TOKEN ?? "",
    apiKey:
      process.env.LOADTEST_FIREBASE_API_KEY ??
      process.env.FIREBASE_API_KEY ??
      "",
    host: "127.0.0.1",
    authPort: 9099,
    firestorePort: 8080,
    functionsPort: 5001,
    prodOrigin: "https://gdgica.com",
    webOrigin: "http://localhost:4321",
    projectId: undefined,
  };

  for (const raw of argv) {
    if (raw === "--pause") {
      args.pause = true;
      continue;
    }
    if (raw === "--confirm-prod") {
      args.confirmProd = true;
      continue;
    }
    const [flag, value] = raw.split("=");
    if (!value) continue;
    if (flag === "--target") args.target = value;
    else if (flag === "--users") args.users = Math.max(1, Number(value));
    else if (flag === "--slug") args.slug = value;
    else if (flag === "--games")
      args.games = value
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
    else if (flag === "--quiz-limit")
      args.quizLimitSec = Math.max(4, Number(value));
    else if (flag === "--concurrency")
      args.concurrency = Math.max(1, Number(value));
    else if (flag === "--admin-token") args.adminToken = value;
    else if (flag === "--api-key") args.apiKey = value;
    else if (flag === "--host") args.host = value;
    else if (flag === "--auth-port") args.authPort = Number(value);
    else if (flag === "--firestore-port") args.firestorePort = Number(value);
    else if (flag === "--functions-port") args.functionsPort = Number(value);
    else if (flag === "--prod-origin") args.prodOrigin = value;
    else if (flag === "--web-origin") args.webOrigin = value;
    else if (flag === "--project") args.projectId = value;
  }

  if (args.target === "prod" && args.webOrigin === "http://localhost:4321") {
    args.webOrigin = args.prodOrigin;
  }
  if (args.pause && args.quizLimitSec === 15) {
    args.quizLimitSec = 25;
  }
  if (args.concurrency === undefined) {
    args.concurrency = args.target === "emulator" ? 20 : 50;
  }
  return args;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  if (config.target !== "emulator" && config.target !== "prod") {
    throw new Error(`Invalid --target=${config.target}. Use emulator or prod.`);
  }
  if (config.target === "prod") {
    if (!config.confirmProd) {
      throw new Error(
        "Safety guard: pass --confirm-prod and a dedicated --slug to run against production."
      );
    }
    if (!config.adminToken) {
      throw new Error(
        "Pass --admin-token=<idToken> or set LOADTEST_ADMIN_TOKEN for production mode."
      );
    }
    if (!config.apiKey) {
      throw new Error(
        "Pass --api-key=<firebaseWebApiKey> or set LOADTEST_FIREBASE_API_KEY for production mode."
      );
    }
  }

  const rl = config.pause
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  async function pauseIfNeeded(message) {
    if (!rl) return;
    await rl.question(`\n[PAUSA] ${message} `);
  }

  const adapter = createSandboxAdapter(config);
  const startMem = process.memoryUsage().rss;
  writeLine(
    `Iniciando sandbox (${config.target}) | usuarios=${config.users} | slug=${config.slug} | juegos=${config.games.join(",")}`
  );
  writeLine(`RAM inicial del proceso loadtest: ${formatMb(startMem)}`);

  const admin = await adapter.setupAdmin();
  const authStart = globalThis.performance.now();
  const users = await adapter.signInAnonymousBatch(config.users, 25);
  const authMs = Math.round(globalThis.performance.now() - authStart);
  writeLine(
    `Autenticados ${users.length} usuarios anónimos en ${authMs}ms | RAM: ${formatMb(process.memoryUsage().rss)}`
  );

  const ctx = {
    target: config.target,
    adapter,
    admin,
    users,
    slug: config.slug,
    pauseIfNeeded,
    webOrigin: config.webOrigin,
    quizLimitSec: config.quizLimitSec,
    concurrency: config.concurrency,
  };

  let allPassed = true;
  if (config.games.includes("roulette")) {
    const ok = await runRouletteScenario(ctx);
    allPassed = allPassed && ok;
  }
  if (config.games.includes("poll")) {
    const ok = await runPollScenario(ctx);
    allPassed = allPassed && ok;
  }
  if (config.games.includes("quiz")) {
    const ok = await runQuizScenario(ctx);
    allPassed = allPassed && ok;
  }

  if (rl) rl.close();

  const endMem = process.memoryUsage().rss;
  writeLine("");
  writeLine(
    `Finalizado | RAM pico/final del loadtest: ${formatMb(endMem)} | Resultado global: ${allPassed ? "ALL PASS" : "FAILED"}`
  );
  process.exitCode = allPassed ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(
    `Loadtest error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exitCode = 1;
});

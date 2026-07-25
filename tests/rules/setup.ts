import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-gdgica";
const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(HERE, "../../firestore.rules");

// El puerto se puede fijar por entorno para poder correr esta suite mientras
// otro emulador ocupa el 8080 (otra copia del repo, otra sesión de trabajo).
// Sin esto, dos checkouts del mismo proyecto no pueden testear a la vez.
const HOST = process.env.FIRESTORE_EMULATOR_HOST_ADDR ?? "127.0.0.1";
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let env: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (env) return env;
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: HOST,
      port: PORT,
    },
  });
  return env;
}

export async function clearAll() {
  if (!env) return;
  await env.clearFirestore();
}

export async function cleanup() {
  if (!env) return;
  await env.cleanup();
  env = null;
}

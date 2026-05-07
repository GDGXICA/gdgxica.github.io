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

let env: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (env) return env;
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
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

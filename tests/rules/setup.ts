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
const STORAGE_RULES_PATH = resolve(HERE, "../../storage.rules");

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
    // Storage is configured on the SAME environment because the credential
    // storage rule resolves the caller's role with firestore.get() against
    // users/{uid} — it needs both emulators, and the seeded role docs have
    // to be visible to the storage rule evaluation.
    storage: {
      rules: readFileSync(STORAGE_RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
  return env;
}

export async function clearAll() {
  if (!env) return;
  await env.clearFirestore();
  await env.clearStorage();
}

export async function cleanup() {
  if (!env) return;
  await env.cleanup();
  env = null;
}

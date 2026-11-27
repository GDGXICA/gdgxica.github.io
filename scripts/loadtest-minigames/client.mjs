import { setTimeout as delay } from "node:timers/promises";

const PROD_PROJECT_ID = "appgdgica";
const EMULATOR_PROJECT_ID = "demo-gdgica";

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(val) {
  if (!val || typeof val !== "object") return undefined;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return Boolean(val.booleanValue);
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("stringValue" in val) return val.stringValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    return (val.arrayValue.values ?? []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const out = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function fromFirestoreDocument(doc) {
  if (!doc?.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

export async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next()
  );
  await Promise.all(workers);
  return results;
}

export async function waitUntil(predicate, timeoutMs = 6000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await predicate();
    if (lastValue?.done) return lastValue;
    await delay(intervalMs);
  }
  return lastValue ?? { done: false };
}

export function createSandboxAdapter(config) {
  const isEmulator = config.target === "emulator";
  const projectId =
    config.projectId ?? (isEmulator ? EMULATOR_PROJECT_ID : PROD_PROJECT_ID);
  const authBase = isEmulator
    ? `http://${config.host}:${config.authPort}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
  const apiKey = isEmulator ? "demo-api-key" : config.apiKey;
  const apiBase = isEmulator
    ? `http://${config.host}:${config.functionsPort}/${projectId}/us-central1/api/api`
    : `${config.prodOrigin}/api`;
  const firestoreBase = isEmulator
    ? `http://${config.host}:${config.firestorePort}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const originHeader = isEmulator ? "http://localhost:4321" : config.prodOrigin;

  async function signUpAnonymous() {
    const res = await globalThis.fetch(
      `${authBase}/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Auth signUp failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    return { uid: json.localId, idToken: json.idToken };
  }

  async function signInAnonymousBatch(count, concurrency = 25) {
    const indices = Array.from({ length: count }, (_, i) => i + 1);
    return runWithConcurrency(indices, concurrency, async (num) => {
      const { uid, idToken } = await signUpAnonymous();
      return {
        uid,
        idToken,
        alias: `Bot${String(num).padStart(3, "0")}`,
      };
    });
  }

  async function apiRequest(
    method,
    path,
    token,
    body,
    timeoutMs = 15_000,
    retries = 0
  ) {
    const started = globalThis.performance.now();
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new globalThis.AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await globalThis.fetch(`${apiBase}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Origin: originHeader,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => null);
        const latencyMs = globalThis.performance.now() - started;
        const retryable =
          res.status === 408 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504;
        if (!res.ok && retryable && attempt < retries) {
          await delay(200 * 2 ** attempt + Math.floor(Math.random() * 100));
          continue;
        }
        return {
          ok: res.ok && Boolean(json?.success),
          status: res.status,
          latencyMs,
          data: json?.data,
          error: json?.error ?? (!res.ok ? `HTTP ${res.status}` : undefined),
        };
      } catch (err) {
        if (attempt < retries) {
          await delay(200 * 2 ** attempt + Math.floor(Math.random() * 100));
          continue;
        }
        const latencyMs = globalThis.performance.now() - started;
        return {
          ok: false,
          status: 0,
          latencyMs,
          data: undefined,
          error: err instanceof Error ? err.name : "NetworkError",
        };
      } finally {
        globalThis.clearTimeout(timer);
      }
    }
    return {
      ok: false,
      status: 0,
      latencyMs: globalThis.performance.now() - started,
      data: undefined,
      error: "NetworkError",
    };
  }

  async function seedEmulatorDocument(docPath, data) {
    if (!isEmulator) {
      throw new Error("seedEmulatorDocument is only allowed in emulator mode");
    }
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    const res = await globalThis.fetch(`${firestoreBase}/${docPath}`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Firestore seed failed for ${docPath} (${res.status}): ${text}`
      );
    }
  }

  async function readDocument(docPath, token) {
    const headers = {};
    if (isEmulator) {
      headers.Authorization = "Bearer owner";
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await globalThis.fetch(`${firestoreBase}/${docPath}`, {
      headers,
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return fromFirestoreDocument(json);
  }

  async function setupAdmin() {
    if (!isEmulator) {
      if (!config.adminToken) {
        throw new Error("--admin-token is required when --target=prod");
      }
      return { uid: "prod-admin", idToken: config.adminToken };
    }
    const adminUser = await signUpAnonymous();
    await seedEmulatorDocument(`users/${adminUser.uid}`, {
      uid: adminUser.uid,
      email: "loadtest-admin@gdgica.local",
      displayName: "LoadTest Admin",
      role: "admin",
      status: "active",
      grants: [],
      revocations: [],
    });
    return adminUser;
  }

  async function createTemplate(adminToken, payload) {
    const res = await apiRequest(
      "POST",
      "/minigame-templates",
      adminToken,
      payload
    );
    if (!res.ok || !res.data?.id) {
      throw new Error(
        `Failed to create template (${res.status}): ${res.error}`
      );
    }
    return res.data.id;
  }

  async function attachAndGoLive(adminToken, slug, templateId, order) {
    const attach = await apiRequest(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames`,
      adminToken,
      { templateId, order }
    );
    if (!attach.ok || !attach.data?.id) {
      throw new Error(
        `Failed to attach instance (${attach.status}): ${attach.error}`
      );
    }
    const id = attach.data.id;
    const live = await apiRequest(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/state`,
      adminToken,
      { state: "live" }
    );
    if (!live.ok) {
      throw new Error(
        `Failed to start instance (${live.status}): ${live.error}`
      );
    }
    return id;
  }

  async function closeInstance(adminToken, slug, id) {
    await apiRequest(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/state`,
      adminToken,
      { state: "closed" }
    );
  }

  return {
    isEmulator,
    signInAnonymousBatch,
    apiRequest,
    seedEmulatorDocument,
    readDocument,
    setupAdmin,
    createTemplate,
    attachAndGoLive,
    closeInstance,
  };
}

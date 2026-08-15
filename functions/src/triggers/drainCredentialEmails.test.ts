import { beforeEach, describe, expect, it, vi } from "vitest";

// The trigger that sends every credential email had no test at all: only its
// pure helpers were covered, via credentialQueue.test.ts. What was untested
// is precisely the part that can double-send, spam Gmail, or park somebody's
// credential forever — the claim, the backoff and the budget.

interface QueuedDoc {
  slug: string;
  id: string;
  data: Record<string, unknown>;
  updates: Record<string, unknown>[];
}

/** Estado del emulador en memoria. */
let queue: QueuedDoc[] = [];
let budgetDoc: Record<string, unknown> | undefined;
const eventDocs = new Map<string, Record<string, unknown>>();
const sent: { to: string; template: string; hasImage: boolean }[] = [];
let sendFails = false;
let transport = "gmail";

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("firebase-functions", () => ({ logger: loggerMock }));

/** `onSchedule` devuelve el handler tal cual para poder invocarlo. */
vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

// Izado: `vi.mock` corre antes que cualquier declaración normal del archivo.
const { FakeTimestamp, FakeFieldValue } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(readonly ms: number) {}
    toDate() {
      return new Date(this.ms);
    }
    static fromDate(d: Date) {
      return new FakeTimestamp(d.getTime());
    }
    static fromMillis(ms: number) {
      return new FakeTimestamp(ms);
    }
  }
  const FakeFieldValue = {
    serverTimestamp: () => "__SERVER_TS__",
    increment: (n: number) => ({ __inc: n }),
  };
  return { FakeTimestamp, FakeFieldValue };
});

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: FakeTimestamp,
  FieldValue: FakeFieldValue,
}));

/** Aplica un patch resolviendo los incrementos como lo haría Firestore. */
function applyPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && "__inc" in value) {
      const by = (value as { __inc: number }).__inc;
      target[key] = ((target[key] as number) ?? 0) + by;
    } else {
      target[key] = value;
    }
  }
}

function refFor(doc: QueuedDoc) {
  return {
    __doc: doc,
    path: `events/${doc.slug}/credentials/${doc.id}`,
    // The drain reads the event slug off the grandparent, exactly as
    // eventStaff.test.ts does for its own collectionGroup query.
    parent: { parent: { id: doc.slug } },
    update: async (patch: Record<string, unknown>) => {
      doc.updates.push(patch);
      applyPatch(doc.data, patch);
    },
  };
}

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () =>
          name === "credential_email_budget"
            ? { data: () => budgetDoc }
            : { data: () => eventDocs.get(id) },
        set: async (data: Record<string, unknown>) => {
          budgetDoc = budgetDoc ?? {};
          applyPatch(budgetDoc, data);
        },
      }),
    }),
    collectionGroup: () => {
      const chain = {
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        get: async () => {
          const docs = queue.map((d) => ({
            id: d.id,
            ref: refFor(d),
            data: () => d.data,
          }));
          return { docs, size: docs.length };
        },
      };
      return chain;
    },
    runTransaction: async (
      fn: (tx: {
        get: (ref: { __doc: QueuedDoc }) => Promise<unknown>;
        update: (
          ref: { __doc: QueuedDoc },
          patch: Record<string, unknown>
        ) => void;
      }) => Promise<unknown>
    ) =>
      fn({
        get: async (ref) => ({ data: () => ref.__doc.data }),
        update: (ref, patch) => {
          ref.__doc.updates.push(patch);
          applyPatch(ref.__doc.data, patch);
        },
      }),
  }),
}));

vi.mock("../config", () => ({
  GMAIL_USER: { value: () => "" },
  GMAIL_APP_PASSWORD: { value: () => "" },
  RESEND_API_KEY: { value: () => "" },
  RESEND_FROM: { value: () => "" },
}));

vi.mock("../services/credentialEmail", () => ({
  sendCredentialEmail: async (mail: Record<string, unknown>) => {
    if (sendFails) throw new Error("smtp down: secret@internal");
    sent.push({
      to: mail.to as string,
      template: mail.template as string,
      hasImage: Boolean(mail.image),
    });
  },
}));

vi.mock("../services/emailSettings", () => ({
  readEmailTransport: async () => transport,
}));

vi.mock("../services/credentialStorage", () => ({
  readCredentialImage: async () => Buffer.from("jpeg"),
}));

const writeAuditLogMock = vi.hoisted(() => vi.fn());
vi.mock("../utils/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { drainCredentialEmails } from "./drainCredentialEmails";

const run = drainCredentialEmails as unknown as () => Promise<void>;

/** Un documento en cola, listo para enviarse. */
function queued(over: Record<string, unknown> = {}, id = "c1"): QueuedDoc {
  return {
    slug: "devfest-2026",
    id,
    data: {
      email: "alvaro@example.com",
      firstName: "Alvaro",
      groupLetter: "Q",
      credentialImagePath: "credentials/devfest-2026/c1/credential.jpg",
      emailStatus: "queued",
      emailTemplate: "credential",
      emailAttempts: 0,
      ...over,
    },
    updates: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queue = [];
  budgetDoc = undefined;
  sent.length = 0;
  sendFails = false;
  transport = "gmail";
  eventDocs.clear();
  eventDocs.set("devfest-2026", {
    title: "DevFest ICA 2026",
    registration_url: "https://gdg.community.dev/devfest-ica-2026",
  });
  writeAuditLogMock.mockResolvedValue(undefined);
});

describe("drainCredentialEmails — envío", () => {
  it("envía lo que está en cola y lo marca como enviado", async () => {
    queue = [queued()];
    await run();

    expect(sent).toEqual([
      { to: "alvaro@example.com", template: "credential", hasImage: true },
    ]);
    expect(queue[0].data.emailStatus).toBe("sent");
    expect(queue[0].data.emailLastError).toBeNull();
  });

  it("descuenta del presupuesto del día", async () => {
    queue = [queued()];
    await run();

    expect(budgetDoc).toMatchObject({ sent: 1 });
  });

  it("no envía nada cuando el presupuesto del día está agotado", async () => {
    // El tope de Gmail son 350; con eso ya gastado no debe salir ni uno.
    budgetDoc = { sent: 350 };
    queue = [queued()];
    await run();

    expect(sent).toHaveLength(0);
    expect(queue[0].data.emailStatus).toBe("queued");
    expect(loggerMock.warn).toHaveBeenCalled();
    // Corta antes de reclamar nada, así que tampoco escribe la auditoría.
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});

describe("drainCredentialEmails — el claim", () => {
  // El claim es lo único que impide que dos ejecuciones solapadas, o un
  // disparo manual, manden la misma credencial dos veces.
  it("ignora lo que otra ejecución ya tiene en vuelo", async () => {
    queue = [
      queued({
        emailStatus: "sending",
        emailLastAttemptAt: FakeTimestamp.fromDate(new Date()),
      }),
    ];
    await run();

    expect(sent).toHaveLength(0);
  });

  // Una ejecución que se cayó a medias dejaría el documento en "sending"
  // para siempre; el lease caducado es lo que lo rescata.
  it("recupera un lease caducado", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    queue = [
      queued({
        emailStatus: "sending",
        emailLastAttemptAt: FakeTimestamp.fromDate(stale),
      }),
    ];
    await run();

    expect(sent).toHaveLength(1);
    expect(queue[0].data.emailStatus).toBe("sent");
  });

  it("no reclama un documento sin dirección de correo", async () => {
    queue = [queued({ email: undefined })];
    await run();

    expect(sent).toHaveLength(0);
  });
});

describe("drainCredentialEmails — fallos", () => {
  it("devuelve a la cola con espera creciente mientras queden intentos", async () => {
    sendFails = true;
    queue = [queued({ emailAttempts: 1 })];
    const before = Date.now();
    await run();

    expect(queue[0].data.emailStatus).toBe("queued");
    // La siguiente oportunidad queda en el futuro: eso es el backoff.
    const next = queue[0].data.emailNextAttemptAt as { ms: number };
    expect(next.ms).toBeGreaterThan(before);
  });

  it("aparca el envío en vez de reintentar para siempre", async () => {
    sendFails = true;
    // Con 5 previos, este intento es el sexto y agota la escalera.
    queue = [queued({ emailAttempts: 5 })];
    await run();

    expect(queue[0].data.emailStatus).toBe("failed");
    expect(queue[0].data.emailLastError).toContain("smtp down");
  });

  it("recorta el error guardado para que no crezca sin límite", async () => {
    sendFails = true;
    queue = [queued({ emailAttempts: 5 })];
    await run();

    expect((queue[0].data.emailLastError as string).length).toBeLessThanOrEqual(
      300
    );
  });
});

describe("drainCredentialEmails — plantillas", () => {
  // Antes de que existiera el recordatorio, esto colapsaba todo lo que no
  // fuera photo_removed en "credential", que le habría mandado a quien
  // esperaba un recordatorio el mensaje equivocado con la tarjeta adjunta.
  it("respeta cada plantilla en vez de colapsarlas", async () => {
    queue = [
      queued({ emailTemplate: "reminder" }, "c1"),
      queued({ emailTemplate: "photo_removed" }, "c2"),
    ];
    await run();

    expect(sent.map((s) => s.template)).toEqual(["reminder", "photo_removed"]);
  });

  it("cae en la credencial ante una plantilla desconocida", async () => {
    // Nunca se pasa tal cual: un valor que no reconocemos no puede acabar
    // llegando al transporte.
    queue = [queued({ emailTemplate: "vete-a-saber" })];
    await run();

    expect(sent[0].template).toBe("credential");
  });
});

describe("drainCredentialEmails — auditoría", () => {
  // Una fila por correo añadiría ~350 documentos a audit_log por evento y
  // ahogaría cualquier otra acción.
  it("escribe una sola entrada por ejecución, no una por correo", async () => {
    queue = [queued({}, "c1"), queued({}, "c2"), queued({}, "c3")];
    await run();

    expect(sent).toHaveLength(3);
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    const [entry] = writeAuditLogMock.mock.calls[0];
    expect(entry).toMatchObject({
      action: "credential_email.drain",
      performedBy: "system",
      details: { due: 3, claimed: 3, sent: 3, failed: 0, parked: 0 },
    });
  });

  it("no deja rastro de a quién se le escribió", async () => {
    queue = [queued()];
    await run();

    const [entry] = writeAuditLogMock.mock.calls[0];
    expect(JSON.stringify(entry)).not.toContain("alvaro@example.com");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Estado del emulador en memoria. */
const docs = new Map<string, Record<string, unknown>>();
let rows: Record<string, unknown>[] = [];
let emailFails = false;
const sentAlerts: Record<string, unknown>[] = [];

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
const { FakeTimestamp } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private readonly ms: number) {}
    toDate() {
      return new Date(this.ms);
    }
    static fromDate(d: Date) {
      return new FakeTimestamp(d.getTime());
    }
  }
  return { FakeTimestamp };
});

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: FakeTimestamp,
}));

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    doc: (path: string) => ({
      get: async () => ({
        data: () => docs.get(path),
        exists: docs.has(path),
      }),
      set: async (data: Record<string, unknown>) => {
        docs.set(path, { ...(docs.get(path) ?? {}), ...data });
      },
    }),
    collection: () => {
      const chain = {
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        get: async () => ({ docs: rows.map((r) => ({ data: () => r })) }),
      };
      return chain;
    },
  }),
}));

vi.mock("../config", () => ({
  GMAIL_USER: { value: () => "" },
  GMAIL_APP_PASSWORD: { value: () => "" },
  RESEND_API_KEY: { value: () => "" },
  RESEND_FROM: { value: () => "" },
  SITE_ORIGIN: "https://gdgica.com",
}));

vi.mock("../services/email", () => ({
  sendAuditAlertEmail: async (mail: Record<string, unknown>) => {
    if (emailFails) throw new Error("smtp down");
    sentAlerts.push(mail);
  },
}));

import { auditAlerts } from "./auditAlerts";

const run = auditAlerts as unknown as () => Promise<void>;

/** Fila crítica con la antigüedad indicada. */
function critical(over: Record<string, unknown> = {}, agoMs = 60_000) {
  return {
    action: "user.role.change",
    severity: "critical",
    performedBy: "actor-1",
    timestamp: new FakeTimestamp(Date.now() - agoMs),
    context: { ipPrefix: "181.65.42.0/24" },
    ...over,
  };
}

beforeEach(() => {
  docs.clear();
  rows = [];
  emailFails = false;
  sentAlerts.length = 0;
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
});

describe("aviso", () => {
  it("manda un correo con lo crítico reciente", async () => {
    rows = [critical()];
    await run();
    expect(sentAlerts).toHaveLength(1);
    expect(sentAlerts[0]).toMatchObject({
      to: "aalvaropc@gmail.com",
      total: 1,
    });
  });

  it("no manda nada si no hay eventos", async () => {
    rows = [];
    await run();
    expect(sentAlerts).toHaveLength(0);
  });

  // Decenas de correos se leen como spam y se empiezan a ignorar justo cuando
  // importan, así que una ráfaga va en un solo aviso.
  it("agrupa varios eventos en un correo", async () => {
    rows = [critical(), critical({ performedBy: "actor-2" }), critical()];
    await run();
    expect(sentAlerts).toHaveLength(1);
    expect(sentAlerts[0]).toMatchObject({ total: 3 });
  });

  // Recortar la lista está bien; ocultar que se recortó, no.
  it("recorta el detalle pero dice el total real", async () => {
    rows = Array.from({ length: 40 }, () => critical());
    await run();
    const alert = sentAlerts[0] as { total: number; events: unknown[] };
    expect(alert.total).toBe(40);
    expect(alert.events).toHaveLength(25);
  });

  it("incluye el prefijo de red, no la dirección", async () => {
    rows = [critical()];
    await run();
    expect(JSON.stringify(sentAlerts[0])).toContain("181.65.42.0/24");
  });

  it("enlaza al panel ya filtrado", async () => {
    rows = [critical()];
    await run();
    expect(sentAlerts[0]).toMatchObject({
      panelUrl: "https://gdgica.com/admin/audit?severity=critical",
    });
  });
});

describe("marca de agua", () => {
  it("la avanza tras ejecutarse", async () => {
    rows = [critical()];
    await run();
    expect(docs.get("settings/auditAlerts")?.lastCheckedAt).toBeDefined();
  });

  // Si solo avanzara al mandar correo, una hora tranquila dejaría la ventana
  // abierta y la siguiente ejecución volvería a mirar lo mismo.
  it("la avanza incluso sin nada que avisar", async () => {
    rows = [];
    await run();
    expect(docs.get("settings/auditAlerts")?.lastCheckedAt).toBeDefined();
  });

  // Lo que hace la función idempotente: correr dos veces no avisa dos veces del
  // mismo evento.
  it("no repite el aviso en la segunda ejecución", async () => {
    rows = [critical()];
    await run();
    expect(sentAlerts).toHaveLength(1);
    await run();
    expect(sentAlerts).toHaveLength(1);
  });

  it("sí avisa de algo nuevo tras la primera ejecución", async () => {
    // Hace falta separación temporal real: las dos ejecuciones ocurren en el
    // mismo milisegundo si no se avanza el reloj, y entonces nada puede caer
    // entre la marca de agua y el final de la ventana siguiente.
    vi.useFakeTimers();
    try {
      rows = [critical({}, 60_000)];
      await run();
      expect(sentAlerts).toHaveLength(1);

      vi.advanceTimersByTime(30 * 60 * 1000);
      rows = [critical({ performedBy: "actor-nuevo" }, 60_000)];
      await run();
    } finally {
      vi.useRealTimers();
    }
    expect(sentAlerts).toHaveLength(2);
    expect(sentAlerts[1]).toMatchObject({ total: 1 });
  });

  // La ventana se cierra ANTES de consultar, así que una fila escrita mientras
  // la función corre pertenece a la ventana siguiente y no se pierde.
  it("deja para la siguiente ventana lo posterior a su cierre", async () => {
    rows = [critical({}, -60_000)];
    await run();
    expect(sentAlerts).toHaveLength(0);
  });

  // Arrancar avisando de todo el histórico garantiza que el primer correo se
  // ignore, así que sin marca de agua solo se mira la última hora.
  it("la primera ejecución solo mira la última hora", async () => {
    rows = [critical({}, 5 * 60 * 60 * 1000)];
    await run();
    expect(sentAlerts).toHaveLength(0);
  });

  it("descarta filas sin marca de tiempo", async () => {
    rows = [critical({ timestamp: undefined })];
    await run();
    expect(sentAlerts).toHaveLength(0);
  });
});

describe("fallo del correo", () => {
  // La marca de agua ya avanzó, así que el aviso de esta ventana se pierde. Se
  // acepta a cambio de la idempotencia, pero tiene que quedar en Cloud Logging:
  // es donde se mira si las alertas dejan de llegar.
  it("registra el fallo y no lanza", async () => {
    emailFails = true;
    rows = [critical()];
    await expect(run()).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledWith(
      "audit.alert.failed",
      expect.objectContaining({ total: 1 })
    );
  });

  it("aun fallando, la marca de agua avanza", async () => {
    emailFails = true;
    rows = [critical()];
    await run();
    expect(docs.get("settings/auditAlerts")?.lastCheckedAt).toBeDefined();
  });
});

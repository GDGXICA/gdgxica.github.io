import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SERVER_TS = "__SERVER_TS__";

const mocks = vi.hoisted(() => ({
  docMock: vi.fn(),
  collectionMock: vi.fn(),
  runTransactionMock: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: () => ({
    doc: mocks.docMock,
    collection: mocks.collectionMock,
    runTransaction: mocks.runTransactionMock,
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
}));

import * as handler from "./minigameRoulette";
import type { AuthenticatedRequest } from "../middleware/auth";

const { docMock, collectionMock, runTransactionMock } = mocks;

interface ResMock extends Response {
  __status: number | undefined;
  __body: unknown;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = {};
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: unknown) {
    this.__body = body;
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

function buildReq(uid = "operator-1"): Request {
  return {
    body: {},
    params: { slug: "devfest-2026", id: "roulette-A" },
    user: { uid },
  } as unknown as AuthenticatedRequest as unknown as Request;
}

/** Un doc de participante tal y como queda escrito por /join. */
type ParticipantDoc = Record<string, unknown>;

interface Scene {
  instance?: Record<string, unknown>;
  participants?: Array<{ id: string; data: ParticipantDoc }>;
}

interface Wiring {
  instanceUpdates: Array<Record<string, unknown>>;
  participantUpdates: Array<{ id: string; data: Record<string, unknown> }>;
  audit: ReturnType<typeof vi.fn>;
}

// Cablea lo justo del Admin SDK para este handler: el doc de instancia y su
// subcoleccion de participantes.
function wire(scene: Scene): Wiring {
  const instanceUpdates: Array<Record<string, unknown>> = [];
  const participantUpdates: Array<{
    id: string;
    data: Record<string, unknown>;
  }> = [];
  const audit = vi.fn(async () => undefined);

  const instanceSnap = () => ({
    exists: scene.instance !== undefined,
    data: () => scene.instance,
  });

  const participantDocs = (scene.participants ?? []).map((p) => ({
    id: p.id,
    data: () => p.data,
  }));

  const participantsCol = {
    get: vi.fn(async () => ({
      docs: participantDocs,
      empty: participantDocs.length === 0,
    })),
    doc: vi.fn((id: string) => ({ __kind: "participant", id })),
  };

  const runTransaction = vi.fn(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      get: vi.fn(async () => instanceSnap()),
      update: vi.fn(
        (
          ref: { __kind?: string; id?: string },
          data: Record<string, unknown>
        ) => {
          if (ref.__kind === "participant") {
            participantUpdates.push({ id: ref.id as string, data });
          } else {
            instanceUpdates.push(data);
          }
        }
      ),
    };
    return cb(tx);
  });

  const instanceRef = {
    id: "roulette-A",
    get: vi.fn(async () => instanceSnap()),
    collection: vi.fn((name: string) => {
      if (name === "participants") return participantsCol;
      throw new Error("unexpected collection " + name);
    }),
  };

  docMock.mockImplementation(() => instanceRef);
  collectionMock.mockImplementation((name: string) => {
    if (name === "audit_log") return { add: audit };
    throw new Error("unexpected root collection " + name);
  });
  runTransactionMock.mockImplementation(runTransaction);

  return { instanceUpdates, participantUpdates, audit };
}

const LIVE = { type: "roulette", state: "live", spinCount: 0 };

// Lo que /join escribe de verdad (minigameJoin.ts): sin `rouletteWonAt`.
const JOINED = (alias: string): ParticipantDoc => ({
  uid: `uid-${alias}`,
  alias,
  joinedAt: SERVER_TS,
});

describe("minigameRoulette.spin", () => {
  beforeEach(() => {
    docMock.mockReset();
    collectionMock.mockReset();
    runTransactionMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  describe("guardas", () => {
    it("404 si la instancia no existe", async () => {
      wire({});
      const res = buildRes();
      await handler.spin(buildReq(), res);
      expect(res.__status).toBe(404);
    });

    it("rechaza una instancia que no es ruleta", async () => {
      wire({ instance: { type: "bingo", state: "live" } });
      const res = buildRes();
      await handler.spin(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/no es.*ruleta/i);
    });

    it("rechaza una ruleta que no esta en vivo", async () => {
      wire({ instance: { ...LIVE, state: "scheduled" } });
      const res = buildRes();
      await handler.spin(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/en vivo/i);
    });
  });

  describe("elegibilidad", () => {
    // La regresion que dejo la ruleta muerta en produccion: /join no siembra
    // `rouletteWonAt`, y un where("rouletteWonAt", "==", null) no ve el campo
    // ausente. El panel mostraba participantes y habilitaba el boton mientras
    // el servidor respondia 400 "No hay participantes elegibles".
    it("cuenta como elegible al participante sin el campo rouletteWonAt", async () => {
      const w = wire({
        instance: LIVE,
        participants: [{ id: "uid-eduardo", data: JOINED("eduardo") }],
      });
      const res = buildRes();
      await handler.spin(buildReq(), res);

      expect(res.__status).toBeUndefined();
      expect((res.__body as { data: unknown }).data).toEqual({
        winnerId: "uid-eduardo",
        alias: "eduardo",
        spinNumber: 1,
      });
      expect(w.participantUpdates).toEqual([
        {
          id: "uid-eduardo",
          data: { rouletteWonAt: SERVER_TS, rouletteSpinNumber: 1 },
        },
      ]);
      expect(w.instanceUpdates).toEqual([
        {
          spinCount: 1,
          lastSpinWinnerId: "uid-eduardo",
          lastSpinAt: SERVER_TS,
        },
      ]);
    });

    it("cuenta como elegible al participante con rouletteWonAt null explicito", async () => {
      wire({
        instance: LIVE,
        participants: [
          {
            id: "uid-harold",
            data: { ...JOINED("harold"), rouletteWonAt: null },
          },
        ],
      });
      const res = buildRes();
      await handler.spin(buildReq(), res);

      expect(res.__status).toBeUndefined();
      expect((res.__body as { data: { winnerId: string } }).data.winnerId).toBe(
        "uid-harold"
      );
    });

    it("nunca vuelve a sacar a quien ya gano", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      wire({
        instance: { ...LIVE, spinCount: 1 },
        participants: [
          {
            id: "uid-ganador",
            data: {
              ...JOINED("ganador"),
              rouletteWonAt: SERVER_TS,
              rouletteSpinNumber: 1,
            },
          },
          { id: "uid-pendiente", data: JOINED("pendiente") },
        ],
      });
      const res = buildRes();
      await handler.spin(buildReq(), res);

      // Math.random() === 0 elige el primer elegible: si el ganador anterior
      // siguiera en la lista, saldria el, no `pendiente`.
      expect((res.__body as { data: { winnerId: string } }).data.winnerId).toBe(
        "uid-pendiente"
      );
      expect(
        (res.__body as { data: { spinNumber: number } }).data.spinNumber
      ).toBe(2);
    });

    it("400 cuando no hay ningun participante", async () => {
      wire({ instance: LIVE, participants: [] });
      const res = buildRes();
      await handler.spin(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/elegibles/i);
    });

    it("400 cuando todos los participantes ya ganaron", async () => {
      wire({
        instance: { ...LIVE, spinCount: 1 },
        participants: [
          {
            id: "uid-ganador",
            data: { ...JOINED("ganador"), rouletteWonAt: SERVER_TS },
          },
        ],
      });
      const res = buildRes();
      await handler.spin(buildReq(), res);
      expect(res.__status).toBe(400);
      expect((res.__body as { error: string }).error).toMatch(/elegibles/i);
    });
  });

  it("deja registro de auditoria del giro", async () => {
    const w = wire({
      instance: LIVE,
      participants: [{ id: "uid-eduardo", data: JOINED("eduardo") }],
    });
    await handler.spin(buildReq("operator-1"), buildRes());

    expect(w.audit).toHaveBeenCalledTimes(1);
    const entry = w.audit.mock.calls[0][0] as Record<string, unknown>;
    expect(entry.action).toBe("minigame_instance.roulette.spin");
    expect(entry.performedBy).toBe("operator-1");
    expect(entry.details).toMatchObject({
      slug: "devfest-2026",
      winnerId: "uid-eduardo",
      alias: "eduardo",
      spinNumber: 1,
    });
  });
});

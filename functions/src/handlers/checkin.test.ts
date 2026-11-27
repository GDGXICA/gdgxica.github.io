import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type StoredDoc = Record<string, unknown>;

const state = vi.hoisted(() => ({
  docs: new Map<string, StoredDoc>(),
  meta: new Map<string, StoredDoc>(),
  writeAuditLog: vi.fn(),
}));

function makeDocSnapshot(id: string, data: StoredDoc) {
  return {
    id,
    exists: true,
    data: () => ({ ...data }),
  };
}

function makeFirestoreMock() {
  return {
    collection: (path: string) => ({
      doc: (id: string) => ({
        __path: `${path}/${id}`,
        __id: id,
        create: async (data: StoredDoc) => {
          if (state.docs.has(id)) {
            const err = new Error("Already exists") as Error & {
              code?: number;
            };
            err.code = 6;
            throw err;
          }
          state.docs.set(id, { ...data });
        },
        set: async (data: StoredDoc, opts?: { merge?: boolean }) => {
          const prev = opts?.merge ? (state.docs.get(id) ?? {}) : {};
          state.docs.set(id, { ...prev, ...data });
        },
      }),
      select: () => ({
        get: async () => ({
          size: state.docs.size,
          docs: [...state.docs.entries()].map(([id, data]) =>
            makeDocSnapshot(id, data)
          ),
        }),
      }),
      where: (field: string, op: string, value: unknown) => {
        const filterDocs = () =>
          [...state.docs.entries()]
            .filter(([, data]) => (op === "==" ? data[field] === value : false))
            .map(([id, data]) => makeDocSnapshot(id, data));
        return {
          get: async () => {
            const matched = filterDocs();
            return {
              empty: matched.length === 0,
              size: matched.length,
              docs: matched,
            };
          },
          limit: (n: number) => ({
            get: async () => {
              const matched = filterDocs().slice(0, n);
              return {
                empty: matched.length === 0,
                size: matched.length,
                docs: matched,
              };
            },
          }),
        };
      },
    }),
    doc: (path: string) => ({
      set: async (data: StoredDoc, opts?: { merge?: boolean }) => {
        const prev = opts?.merge ? (state.meta.get(path) ?? {}) : {};
        state.meta.set(path, { ...prev, ...data });
      },
    }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (
          ref: { __id: string },
          data: StoredDoc,
          opts?: { merge?: boolean }
        ) => {
          ops.push(() => {
            const prev = opts?.merge ? (state.docs.get(ref.__id) ?? {}) : {};
            state.docs.set(ref.__id, { ...prev, ...data });
          });
        },
        delete: (ref: { __id: string }) => {
          ops.push(() => {
            state.docs.delete(ref.__id);
          });
        },
        commit: async () => {
          for (const op of ops) op();
        },
      };
    },
  };
}

vi.mock("firebase-admin", () => ({
  firestore: () => makeFirestoreMock(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TS__",
  },
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: state.writeAuditLog,
}));

import { importRoster, registerManualAttendee } from "./checkin";
import { checkinManualAttendeeSchema } from "../schemas";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function mockReq(body: Record<string, unknown>, slug = "devfest-2026") {
  return {
    params: { slug },
    body,
    user: {
      uid: "vol-1",
      displayName: "Alvaro",
      email: "alvaro@gdgica.com",
    },
  } as unknown as Request;
}

beforeEach(() => {
  state.docs.clear();
  state.meta.clear();
  state.writeAuditLog.mockReset();
  state.writeAuditLog.mockResolvedValue(undefined);
});

describe("checkinManualAttendeeSchema", () => {
  it("accepts required fields with defaults for optional fields", () => {
    const parsed = checkinManualAttendeeSchema.parse({
      firstName: "Lucia",
      lastName: "Quispe",
      email: "Lucia@Example.com",
    });
    expect(parsed).toEqual({
      firstName: "Lucia",
      lastName: "Quispe",
      email: "lucia@example.com",
      ticketTitle: "General Admission",
      dni: "",
      heardAbout: "",
      checkedIn: true,
    });
  });

  it("accepts optional DNI and Bevy heard-about options", () => {
    const parsed = checkinManualAttendeeSchema.parse({
      firstName: "Mateo",
      lastName: "Ramos",
      email: "mateo@example.com",
      ticketTitle: "Speaker",
      dni: "71234567",
      heardAbout: "Redes sociales",
      checkedIn: false,
    });
    expect(parsed.dni).toBe("71234567");
    expect(parsed.heardAbout).toBe("Redes sociales");
    expect(parsed.checkedIn).toBe(false);
  });

  it("rejects invalid DNI and unknown heardAbout values", () => {
    expect(() =>
      checkinManualAttendeeSchema.parse({
        firstName: "Mateo",
        lastName: "Ramos",
        email: "mateo@example.com",
        dni: "12",
      })
    ).toThrow();

    expect(() =>
      checkinManualAttendeeSchema.parse({
        firstName: "Mateo",
        lastName: "Ramos",
        email: "mateo@example.com",
        heardAbout: "Radio local",
      })
    ).toThrow();
  });
});

describe("registerManualAttendee", () => {
  it("creates a manual attendee marked checked in with searchable DNI tokens", async () => {
    const res = mockRes();
    await registerManualAttendee(
      mockReq({
        firstName: "Lucía",
        lastName: "Quispe",
        email: "Lucia@Example.com",
        ticketTitle: "General Admission",
        dni: "71234567",
        heardAbout: "Me notificó la comunidad",
        checkedIn: true,
      }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(201);
    const payload = res.body as {
      success: boolean;
      data: { id: string; source: string; email: string; checkedIn: boolean };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.id).toMatch(/^m_[a-f0-9]{16}$/);
    expect(payload.data.source).toBe("manual");
    expect(payload.data.email).toBe("lucia@example.com");

    const stored = state.docs.get(payload.data.id);
    expect(stored).toMatchObject({
      source: "manual",
      firstName: "Lucía",
      lastName: "Quispe",
      email: "lucia@example.com",
      ticketTitle: "General Admission",
      dni: "71234567",
      dniNormalized: "71234567",
      heardAbout: "Me notificó la comunidad",
      checkedIn: true,
      checkedInBy: "vol-1",
      checkedInByName: "Alvaro",
      lastActionBy: "vol-1",
    });
    expect(stored?.searchTokens).toContain("71234567");
    expect(stored?.searchTokens).toContain("lucia");

    expect(state.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "checkin.manual.create",
        performedBy: "vol-1",
        targetId: payload.data.id,
        targetType: "roster_attendee",
        details: {
          eventSlug: "devfest-2026",
          checkedIn: true,
          ticketTitle: "General Admission",
          hasDni: true,
          hasHeardAbout: true,
        },
      }),
      expect.anything()
    );
  });

  it("creates an unchecked manual attendee when checkedIn is false", async () => {
    const res = mockRes();
    await registerManualAttendee(
      mockReq({
        firstName: "Carlos",
        lastName: "Mendoza",
        email: "carlos@example.com",
        ticketTitle: "General Admission",
        dni: "",
        heardAbout: "",
        checkedIn: false,
      }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(201);
    const payload = res.body as { data: { id: string } };
    const stored = state.docs.get(payload.data.id);
    expect(stored?.checkedIn).toBe(false);
    expect(stored?.dni).toBeNull();
    expect(stored?.heardAbout).toBeNull();
    expect(stored?.checkedInBy).toBeUndefined();
  });

  it("rejects duplicate emails with 409 and returns the existing id", async () => {
    state.docs.set("t_GOOGA1", {
      source: "bevy",
      email: "dup@example.com",
      checkedIn: false,
    });

    const res = mockRes();
    await registerManualAttendee(
      mockReq({
        firstName: "Ana",
        lastName: "Flores",
        email: "DUP@example.com",
        ticketTitle: "General Admission",
        dni: "",
        heardAbout: "",
        checkedIn: true,
      }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: "Ya existe un asistente registrado con ese correo en este evento.",
      data: {
        existingId: "t_GOOGA1",
        source: "bevy",
        checkedIn: false,
      },
    });
    expect(state.docs.size).toBe(1);
    expect(state.writeAuditLog).not.toHaveBeenCalled();
  });

  it("handles concurrent duplicate submissions atomically with 409", async () => {
    const firstRes = mockRes();
    const secondRes = mockRes();
    const payload = {
      firstName: "Juan",
      lastName: "Perez",
      email: "race@example.com",
      ticketTitle: "General Admission",
      dni: "",
      heardAbout: "",
      checkedIn: true,
    };

    await registerManualAttendee(
      mockReq(payload),
      firstRes as unknown as Response
    );
    expect(firstRes.statusCode).toBe(201);

    const createdId = (firstRes.body as { data: { id: string } }).data.id;
    state.docs.set(createdId, { source: "manual", email: "other@example.com" });

    await registerManualAttendee(
      mockReq(payload),
      secondRes as unknown as Response
    );
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.body).toMatchObject({
      success: false,
      data: { existingId: createdId, source: "manual" },
    });
  });
});

describe("importRoster — compatibility with manual walk-ins", () => {
  it("does not count manual attendees as stale during a Bevy CSV import", async () => {
    state.docs.set("m_walkin1", {
      source: "manual",
      email: "walkin@example.com",
      firstName: "Walk",
      lastName: "In",
      checkedIn: true,
    });

    const res = mockRes();
    await importRoster(
      mockReq({
        rows: [
          {
            ticketNumber: "GOOGA100",
            orderNumber: "ORD-1",
            firstName: "Bevy",
            lastName: "User",
            email: "bevy@example.com",
            company: "",
            title: "",
            ticketTitle: "General Admission",
            bevyCheckinAt: "",
          },
        ],
      }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        created: 1,
        updated: 0,
        stale: 0,
        mergedManual: 0,
      },
    });
    expect(state.docs.has("m_walkin1")).toBe(true);
    expect(state.docs.get("t_GOOGA100")?.source).toBe("bevy");
  });

  it("merges a manual walk-in into its Bevy record when re-imported by email", async () => {
    state.docs.set("m_walkin2", {
      source: "manual",
      email: "walkin@example.com",
      firstName: "Lucia",
      lastName: "Quispe",
      dni: "71234567",
      heardAbout: "Redes sociales",
      checkedIn: true,
      checkedInAt: "2026-11-27T15:00:00Z",
      checkedInBy: "vol-1",
      checkedInByName: "Alvaro",
      lastActionBy: "vol-1",
      lastActionByName: "Alvaro",
      lastActionAt: "2026-11-27T15:00:00Z",
    });

    const res = mockRes();
    await importRoster(
      mockReq({
        rows: [
          {
            ticketNumber: "GOOGA200",
            orderNumber: "ORD-2",
            firstName: "Lucia",
            lastName: "Quispe",
            email: "WALKIN@example.com",
            company: "",
            title: "",
            ticketTitle: "General Admission",
            bevyCheckinAt: "",
          },
        ],
      }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        created: 1,
        updated: 0,
        stale: 0,
        mergedManual: 1,
      },
    });
    expect(state.docs.has("m_walkin2")).toBe(false);
    const merged = state.docs.get("t_GOOGA200");
    expect(merged).toMatchObject({
      source: "bevy",
      ticketNumber: "GOOGA200",
      email: "walkin@example.com",
      dni: "71234567",
      heardAbout: "Redes sociales",
      checkedIn: true,
      checkedInBy: "vol-1",
      checkedInByName: "Alvaro",
    });
    expect(merged?.searchTokens).toContain("71234567");
  });
});

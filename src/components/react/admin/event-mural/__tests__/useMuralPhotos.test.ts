import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const queryCalls: unknown[][] = [];

vi.mock("@/lib/firebase", () => ({
  getFirestore: async () => ({ __db: true }),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  doc: (_db: unknown, path: string) => ({ __doc: path }),
  where: (field: string, op: string, value: unknown) => ({
    __where: [field, op, value],
  }),
  orderBy: (field: string, dir: string) => ({ __orderBy: [field, dir] }),
  limit: (n: number) => ({ __limit: n }),
  query: (...args: unknown[]) => {
    queryCalls.push(args);
    return { __query: args };
  },
  onSnapshot: () => () => {},
}));

import { useMuralPhotos, MAX_LISTED } from "../useMuralPhotos";

function constraintsOf(call: unknown[]) {
  return call.slice(1) as Record<string, unknown>[];
}

function findQueryWithStatus(status: string) {
  return queryCalls.find((call) =>
    constraintsOf(call).some(
      (c) =>
        Array.isArray(c.__where) &&
        c.__where[0] === "status" &&
        c.__where[2] === status
    )
  );
}

beforeEach(() => {
  queryCalls.length = 0;
});

afterEach(cleanup);

describe("useMuralPhotos", () => {
  /**
   * El bug que esto fija: la cola pedía las 300 fotos MÁS ANTIGUAS sin filtrar
   * por estado y separaba en cliente. Pasada la foto 301 de cualquier estado,
   * lo pendiente nuevo no entraba jamás en la ventana y el mural dejaba de
   * moderarse sin que nada fallara.
   */
  it("pide las pendientes ACOTANDO por estado, no filtrando en cliente", async () => {
    renderHook(() => useMuralPhotos("devfest-ica-2026"));

    await waitFor(() => expect(findQueryWithStatus("pending")).toBeDefined());

    const constraints = constraintsOf(findQueryWithStatus("pending")!);
    expect(constraints).toContainEqual({ __orderBy: ["createdAt", "asc"] });
    expect(constraints).toContainEqual({ __limit: MAX_LISTED });
  });

  it("pide las aprobadas por separado, de la más reciente hacia atrás", async () => {
    renderHook(() => useMuralPhotos("devfest-ica-2026"));

    await waitFor(() => expect(findQueryWithStatus("approved")).toBeDefined());

    const constraints = constraintsOf(findQueryWithStatus("approved")!);
    expect(constraints).toContainEqual({ __orderBy: ["approvedAt", "desc"] });
  });

  it("ninguna consulta va sin acotar por estado", async () => {
    renderHook(() => useMuralPhotos("devfest-ica-2026"));

    await waitFor(() => expect(queryCalls.length).toBeGreaterThan(1));

    for (const call of queryCalls) {
      const hasStatus = constraintsOf(call).some(
        (c) => Array.isArray(c.__where) && c.__where[0] === "status"
      );
      expect(hasStatus).toBe(true);
    }
  });

  it("no consulta nada sin slug", async () => {
    renderHook(() => useMuralPhotos(null));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queryCalls).toEqual([]);
  });
});

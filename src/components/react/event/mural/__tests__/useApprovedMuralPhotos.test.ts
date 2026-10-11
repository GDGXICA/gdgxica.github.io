import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Snapshot = {
  docs: { id: string; data: () => Record<string, unknown> }[];
  docChanges: () => unknown[];
  metadata: { fromCache: boolean };
};

const mocks = vi.hoisted(() => ({
  listener: null as ((snap: Snapshot) => void) | null,
  options: null as unknown,
}));

vi.mock("@/lib/firebase", () => ({
  getFirestore: async () => ({}),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(
    (_query: unknown, options: unknown, next: (snap: Snapshot) => void) => {
      mocks.options = options;
      mocks.listener = next;
      return () => {};
    }
  ),
}));

import { useApprovedMuralPhotos } from "../useApprovedMuralPhotos";

function snapshot(ids: string[], fromCache: boolean, changed: boolean) {
  return {
    docs: ids.map((id) => ({ id, data: () => ({ status: "approved" }) })),
    docChanges: () => (changed ? ids : []),
    metadata: { fromCache },
  };
}

describe("useApprovedMuralPhotos", () => {
  it("avisa cuándo los datos ya vienen del servidor y no solo de la caché", async () => {
    const { result } = renderHook(() => useApprovedMuralPhotos("devfest"));
    await waitFor(() => expect(mocks.listener).not.toBeNull());
    expect(mocks.options).toEqual({ includeMetadataChanges: true });

    act(() => mocks.listener?.(snapshot(["a"], true, true)));
    expect(result.current.loading).toBe(false);
    expect(result.current.synced).toBe(false);
    const photos = result.current.photos;

    act(() => mocks.listener?.(snapshot(["a"], false, false)));
    expect(result.current.synced).toBe(true);
    expect(result.current.photos).toBe(photos);
  });
});

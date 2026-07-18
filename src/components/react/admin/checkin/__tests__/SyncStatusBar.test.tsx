import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SyncStatusBar } from "../SyncStatusBar";

afterEach(() => cleanup());

describe("SyncStatusBar", () => {
  it("shows the present/total count", () => {
    render(
      <SyncStatusBar present={42} total={134} offline={false} pendingCount={0} />
    );
    expect(screen.getByText("42/134 presentes")).toBeInTheDocument();
  });

  it("reads as synced when online", () => {
    render(
      <SyncStatusBar present={1} total={2} offline={false} pendingCount={0} />
    );
    expect(screen.getByText("Sincronizado")).toBeInTheDocument();
  });

  // The reassuring message is the whole point of the offline indicator: a
  // volunteer who keeps tapping needs to know the taps are not being lost.
  it("reassures the volunteer when writes are queued offline", () => {
    render(
      <SyncStatusBar present={1} total={2} offline={true} pendingCount={3} />
    );
    expect(
      screen.getByText(/Sin conexión — 3 cambios en cola/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Se guardarán solos/)).toBeInTheDocument();
  });

  it("singularizes a lone queued change", () => {
    render(
      <SyncStatusBar present={1} total={2} offline={true} pendingCount={1} />
    );
    expect(screen.getByText(/1 cambio en cola/)).toBeInTheDocument();
  });

  it("distinguishes offline-with-nothing-queued from offline-with-queue", () => {
    render(
      <SyncStatusBar present={1} total={2} offline={true} pendingCount={0} />
    );
    expect(screen.getByText(/datos en caché/)).toBeInTheDocument();
    expect(screen.queryByText(/en cola/)).not.toBeInTheDocument();
  });

  // Regression: an over-eager fix made `offline` unreachable before the
  // first server snapshot, so a volunteer standing at the door with no
  // signal saw a green "Sincronizado" bar. Never claim synced when offline.
  it("never reads as synced while offline", () => {
    render(
      <SyncStatusBar present={0} total={5} offline={true} pendingCount={0} />
    );
    expect(screen.queryByText("Sincronizado")).not.toBeInTheDocument();
  });
});

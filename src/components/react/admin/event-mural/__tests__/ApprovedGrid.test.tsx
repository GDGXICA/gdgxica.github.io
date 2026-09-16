import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovedGrid } from "../ApprovedGrid";
import type { MuralPhoto } from "@/lib/mural";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function approved(over: Partial<MuralPhoto> & { id: string }): MuralPhoto {
  return {
    eventSlug: "devfest-ica-2026",
    status: "approved",
    uid: `anon-${over.id}`,
    alias: over.id,
    storagePath: `mural/devfest-ica-2026/${over.id}.jpg`,
    downloadUrl: `https://firebasestorage.googleapis.com/${over.id}`,
    width: 1600,
    height: 1200,
    bytes: 120_000,
    createdAt: { seconds: 1000 },
    approvedAt: { seconds: 1000 },
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: "",
    removalRequestedAt: null,
    removalRequestNote: "",
    removedReason: null,
    ...over,
  };
}

function aliasesInOrder(): string[] {
  return screen
    .getAllByRole("img")
    .map((img) => img.getAttribute("alt") ?? "")
    .map((alt) => alt.replace("Foto de ", ""));
}

describe("ApprovedGrid", () => {
  it("pone primero las que pidieron retirar, por antiguas que sean", () => {
    render(
      <ApprovedGrid
        busyId={null}
        onTakedown={vi.fn()}
        photos={[
          approved({ id: "reciente", approvedAt: { seconds: 9000 } }),
          approved({ id: "antigua", approvedAt: { seconds: 100 } }),
          approved({
            id: "pidio-retirada",
            approvedAt: { seconds: 50 },
            removalRequestedAt: { seconds: 9500 },
          }),
        ]}
      />
    );

    expect(aliasesInOrder()[0]).toBe("pidio-retirada");
  });

  it("dentro de cada grupo ordena por lo más reciente", () => {
    render(
      <ApprovedGrid
        busyId={null}
        onTakedown={vi.fn()}
        photos={[
          approved({ id: "antigua", approvedAt: { seconds: 100 } }),
          approved({ id: "reciente", approvedAt: { seconds: 9000 } }),
        ]}
      />
    );

    expect(aliasesInOrder()).toEqual(["reciente", "antigua"]);
  });

  it("muestra el motivo que escribió quien la subió", () => {
    render(
      <ApprovedGrid
        busyId={null}
        onTakedown={vi.fn()}
        photos={[
          approved({
            id: "ana",
            removalRequestedAt: { seconds: 1 },
            removalRequestNote: "salgo yo y no quiero",
          }),
        ]}
      />
    );

    expect(screen.getByText(/salgo yo y no quiero/)).toBeInTheDocument();
  });

  it("busca por nombre", async () => {
    render(
      <ApprovedGrid
        busyId={null}
        onTakedown={vi.fn()}
        photos={[approved({ id: "Ana" }), approved({ id: "Beto" })]}
      />
    );

    await userEvent.type(screen.getByPlaceholderText(/buscar/i), "ana");
    expect(aliasesInOrder()).toEqual(["Ana"]);
  });

  describe("retirar", () => {
    it("exige un motivo y lo manda con la razón correcta", async () => {
      vi.spyOn(window, "prompt").mockReturnValue("lo pidió ella");
      const onTakedown = vi.fn();
      render(
        <ApprovedGrid
          busyId={null}
          onTakedown={onTakedown}
          photos={[approved({ id: "ana", removalRequestedAt: { seconds: 1 } })]}
        />
      );

      await userEvent.click(screen.getByRole("button", { name: "Retirar" }));

      expect(onTakedown).toHaveBeenCalledWith(
        "ana",
        "owner_request",
        "lo pidió ella"
      );
    });

    it("clasifica como moderación la que nadie pidió retirar", async () => {
      vi.spyOn(window, "prompt").mockReturnValue("contenido inadecuado");
      const onTakedown = vi.fn();
      render(
        <ApprovedGrid
          busyId={null}
          onTakedown={onTakedown}
          photos={[approved({ id: "x" })]}
        />
      );

      await userEvent.click(screen.getByRole("button", { name: "Retirar" }));
      expect(onTakedown).toHaveBeenCalledWith(
        "x",
        "moderation",
        "contenido inadecuado"
      );
    });

    it("no retira nada si se cancela el motivo", async () => {
      vi.spyOn(window, "prompt").mockReturnValue(null);
      const onTakedown = vi.fn();
      render(
        <ApprovedGrid
          busyId={null}
          onTakedown={onTakedown}
          photos={[approved({ id: "x" })]}
        />
      );

      await userEvent.click(screen.getByRole("button", { name: "Retirar" }));
      expect(onTakedown).not.toHaveBeenCalled();
    });

    it("no retira nada con un motivo en blanco", async () => {
      vi.spyOn(window, "prompt").mockReturnValue("   ");
      vi.spyOn(window, "alert").mockImplementation(() => {});
      const onTakedown = vi.fn();
      render(
        <ApprovedGrid
          busyId={null}
          onTakedown={onTakedown}
          photos={[approved({ id: "x" })]}
        />
      );

      await userEvent.click(screen.getByRole("button", { name: "Retirar" }));
      expect(onTakedown).not.toHaveBeenCalled();
    });
  });

  it("dice que no hay nada cuando el mural está vacío", () => {
    render(<ApprovedGrid busyId={null} onTakedown={vi.fn()} photos={[]} />);
    expect(
      screen.getByText(/todavía no hay ninguna foto/i)
    ).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModerationQueue } from "../ModerationQueue";
import type { MuralPhoto } from "@/lib/mural";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pending(id: string, alias = id): MuralPhoto {
  return {
    id,
    eventSlug: "devfest-ica-2026",
    status: "pending",
    uid: `anon-${id}`,
    alias,
    storagePath: `mural/devfest-ica-2026/${id}.jpg`,
    downloadUrl: `https://firebasestorage.googleapis.com/${id}`,
    width: 1600,
    height: 1200,
    bytes: 120_000,
    createdAt: { seconds: Math.floor(Date.now() / 1000) },
    approvedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: "",
    removalRequestedAt: null,
    removalRequestNote: "",
    removedReason: null,
  };
}

describe("ModerationQueue", () => {
  it("no ofrece nada que revisar cuando la cola está vacía", () => {
    render(<ModerationQueue photos={[]} busyId={null} onReview={vi.fn()} />);
    expect(screen.getByText(/no hay fotos esperando/i)).toBeInTheDocument();
  });

  describe("atajos de teclado", () => {
    it("A aprueba la foto enfocada, que de entrada es la primera (FIFO)", async () => {
      const onReview = vi.fn();
      render(
        <ModerationQueue
          photos={[pending("primera"), pending("segunda")]}
          busyId={null}
          onReview={onReview}
        />
      );

      await userEvent.keyboard("a");
      expect(onReview).toHaveBeenCalledWith("primera", "approve", "");
    });

    it("las flechas mueven el foco", async () => {
      const onReview = vi.fn();
      render(
        <ModerationQueue
          photos={[pending("primera"), pending("segunda")]}
          busyId={null}
          onReview={onReview}
        />
      );

      await userEvent.keyboard("{ArrowRight}");
      await userEvent.keyboard("a");
      expect(onReview).toHaveBeenCalledWith("segunda", "approve", "");
    });

    it("R pide motivo y rechaza con él", async () => {
      vi.spyOn(window, "prompt").mockReturnValue("sale un menor");
      const onReview = vi.fn();
      render(
        <ModerationQueue
          photos={[pending("p1")]}
          busyId={null}
          onReview={onReview}
        />
      );

      await userEvent.keyboard("r");
      expect(onReview).toHaveBeenCalledWith("p1", "reject", "sale un menor");
    });

    it("cancelar el motivo no rechaza nada", async () => {
      vi.spyOn(window, "prompt").mockReturnValue(null);
      const onReview = vi.fn();
      render(
        <ModerationQueue
          photos={[pending("p1")]}
          busyId={null}
          onReview={onReview}
        />
      );

      await userEvent.keyboard("r");
      expect(onReview).not.toHaveBeenCalled();
    });

    it("un motivo en blanco tampoco rechaza", async () => {
      vi.spyOn(window, "prompt").mockReturnValue("  ");
      vi.spyOn(window, "alert").mockImplementation(() => {});
      const onReview = vi.fn();
      render(
        <ModerationQueue
          photos={[pending("p1")]}
          busyId={null}
          onReview={onReview}
        />
      );

      await userEvent.keyboard("r");
      expect(onReview).not.toHaveBeenCalled();
    });

    it("NO secuestra el teclado mientras se escribe en un campo", async () => {
      const onReview = vi.fn();
      render(
        <>
          <input aria-label="nota" />
          <ModerationQueue
            photos={[pending("p1")]}
            busyId={null}
            onReview={onReview}
          />
        </>
      );

      await userEvent.click(screen.getByLabelText("nota"));
      await userEvent.keyboard("casa");
      expect(onReview).not.toHaveBeenCalled();
    });

    it("no dispara nada mientras hay una revisión en vuelo", async () => {
      const onReview = vi.fn();
      render(
        <ModerationQueue
          photos={[pending("p1")]}
          busyId="p1"
          onReview={onReview}
        />
      );

      await userEvent.keyboard("a");
      expect(onReview).not.toHaveBeenCalled();
    });
  });

  it("recorta el foco cuando la cola encoge", async () => {
    const onReview = vi.fn();
    const { rerender } = render(
      <ModerationQueue
        photos={[pending("a1"), pending("b2")]}
        busyId={null}
        onReview={onReview}
      />
    );

    await userEvent.keyboard("{ArrowRight}");
    rerender(
      <ModerationQueue
        photos={[pending("a1")]}
        busyId={null}
        onReview={onReview}
      />
    );

    await userEvent.keyboard("a");
    expect(onReview).toHaveBeenCalledWith("a1", "approve", "");
  });

  it("los botones hacen lo mismo que los atajos", async () => {
    const onReview = vi.fn();
    render(
      <ModerationQueue
        photos={[pending("p1")]}
        busyId={null}
        onReview={onReview}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(onReview).toHaveBeenCalledWith("p1", "approve", "");
  });
});

describe("retirada pedida antes de la aprobación", () => {
  function requested(id: string, note = ""): MuralPhoto {
    return {
      ...pending(id),
      removalRequestedAt: { seconds: 9_999 },
      removalRequestNote: note,
    };
  }

  it("avisa en la tarjeta de que pidieron NO publicarla", () => {
    render(
      <ModerationQueue
        photos={[requested("p1", "salgo yo")]}
        busyId={null}
        onReview={vi.fn()}
      />
    );

    expect(screen.getByText(/pidió que NO se publique/i)).toBeInTheDocument();
    expect(screen.getByText(/salgo yo/)).toBeInTheDocument();
  });

  it("la pone PRIMERA en la cola, por reciente que sea", () => {
    const old = { ...pending("antigua"), createdAt: { seconds: 1 } };
    const asked = { ...requested("pidio"), createdAt: { seconds: 9_000 } };

    render(
      <ModerationQueue photos={[old, asked]} busyId={null} onReview={vi.fn()} />
    );

    const alts = screen
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt") ?? "");
    expect(alts[0]).toContain("pidio");
  });

  it("aprobarla pide confirmación explícita", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onReview = vi.fn();
    render(
      <ModerationQueue
        photos={[requested("p1")]}
        busyId={null}
        onReview={onReview}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));

    expect(confirm).toHaveBeenCalled();
    expect(onReview).not.toHaveBeenCalled();
  });

  it("si se confirma, se aprueba igual", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onReview = vi.fn();
    render(
      <ModerationQueue
        photos={[requested("p1")]}
        busyId={null}
        onReview={onReview}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(onReview).toHaveBeenCalledWith("p1", "approve", "");
  });

  it("una foto normal NO pide confirmación al aprobar", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const onReview = vi.fn();
    render(
      <ModerationQueue
        photos={[pending("p1")]}
        busyId={null}
        onReview={onReview}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledWith("p1", "approve", "");
  });
});

describe("cola llena", () => {
  it("avisa de que hay más esperando de las que caben", () => {
    render(
      <ModerationQueue
        photos={[pending("p1")]}
        busyId={null}
        queueFull
        onReview={vi.fn()}
      />
    );
    expect(screen.getByText(/más fotos esperando/i)).toBeInTheDocument();
  });

  it("no avisa cuando la cola cabe entera", () => {
    render(
      <ModerationQueue
        photos={[pending("p1")]}
        busyId={null}
        onReview={vi.fn()}
      />
    );
    expect(screen.queryByText(/más fotos esperando/i)).not.toBeInTheDocument();
  });
});

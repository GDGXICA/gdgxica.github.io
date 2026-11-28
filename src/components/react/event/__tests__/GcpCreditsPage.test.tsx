import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GCP_CREDITS_BY_EVENT } from "@/data/gcpCredits";
import { GcpCreditsPage } from "../GcpCreditsPage";

const CONFIG = GCP_CREDITS_BY_EVENT["devfest-2026"];

describe("GcpCreditsPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides credit links and manual before 08:00 PET while showing countdown and @gmail.com rule", () => {
    render(
      <GcpCreditsPage
        config={CONFIG}
        initialNowMs={Date.parse("2026-11-28T07:30:00-05:00")}
      />
    );

    expect(screen.getByText(/Se habilita en/i)).toBeVisible();
    expect(screen.getByText(/Solo cuentas @gmail\.com/i)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Canjear créditos ahora/i })
    ).toBeNull();
    expect(screen.queryByText(/gdg-ica-1-bkp/i)).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /Cómo activar tus créditos/i })
    ).toBeNull();
  });

  it("unlocks automatically in real time when crossing 08:00:00 PET", () => {
    vi.useFakeTimers();
    const twoSecondsBefore = Date.parse("2026-11-28T07:59:58-05:00");
    vi.setSystemTime(twoSecondsBefore);

    render(<GcpCreditsPage config={CONFIG} initialNowMs={twoSecondsBefore} />);

    expect(
      screen.queryByRole("link", { name: /Canjear créditos ahora/i })
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const primaryLink = screen.getByRole("link", {
      name: /Canjear créditos ahora/i,
    });
    expect(primaryLink).toHaveAttribute(
      "href",
      "https://g.dev/credits/gdg-ica-1"
    );
  });

  it("renders primary link, keeps backup collapsed until opened, and navigates manual steps", () => {
    render(
      <GcpCreditsPage
        config={CONFIG}
        initialNowMs={Date.parse("2026-11-28T09:15:00-05:00")}
      />
    );

    const primaryLink = screen.getByRole("link", {
      name: /Canjear créditos ahora/i,
    });
    expect(primaryLink).toHaveAttribute(
      "href",
      "https://g.dev/credits/gdg-ica-1"
    );

    expect(
      screen.queryByRole("link", { name: /Abrir enlace de respaldo/i })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Mostrar enlace de respaldo/i })
    );
    expect(
      screen.getByRole("link", { name: /Abrir enlace de respaldo/i })
    ).toHaveAttribute("href", "https://g.dev/credits/gdg-ica-1-bkp");

    expect(screen.getByText("Paso 1 de 12")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    expect(screen.getByText("Paso 2 de 12")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: /Facturación/i }));
    expect(screen.getByText("Paso 11 de 12")).toBeVisible();
  });

  it("shows grace notice after 20:00 PET, hides credit links, and opens manual on Phase 3", () => {
    render(
      <GcpCreditsPage
        config={CONFIG}
        initialNowMs={Date.parse("2026-11-28T20:30:00-05:00")}
      />
    );

    expect(screen.getByText(/Canje de Google finalizado/i)).toBeVisible();
    expect(screen.getByText(/Esta guía cierra en/i)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Canjear créditos ahora/i })
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Cómo activar tus créditos/i })
    ).toBeVisible();
    expect(screen.getByText("Paso 11 de 12")).toBeVisible();
  });

  it("closes the view cleanly at 22:00 PET", () => {
    render(
      <GcpCreditsPage
        config={CONFIG}
        initialNowMs={Date.parse("2026-11-28T22:00:00-05:00")}
      />
    );

    expect(
      screen.getByRole("heading", { name: /El acceso a los créditos cerró/i })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Canjear créditos ahora/i })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /Cómo activar tus créditos/i })
    ).toBeNull();
  });
});

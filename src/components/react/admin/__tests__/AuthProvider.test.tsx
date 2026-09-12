import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  getUserProfile: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  register: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  getUserProfile: mocks.getUserProfile,
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}));

vi.mock("@/lib/api", () => ({
  api: { register: mocks.register },
}));

import { AuthProvider, useAuth } from "../AuthProvider";

const SESSION_KEY = "admin_session_start";
const USER = { uid: "u1", email: "alguien@gdgica.dev" };

/** Expone al DOM justo lo que decide qué pantalla pinta el panel. */
function Probe() {
  const { role, profileError, canAccessPanel, retryProfile } = useAuth();
  return (
    <div>
      <span data-testid="role">{role ?? "-"}</span>
      <span data-testid="error">{String(profileError)}</span>
      <span data-testid="panel">{String(canAccessPanel)}</span>
      <button onClick={() => retryProfile()}>reintentar</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  localStorage.setItem(SESSION_KEY, Date.now().toString());
  mocks.onAuthStateChanged.mockImplementation((cb: (u: unknown) => void) => {
    cb(USER);
    return () => {};
  });
  mocks.register.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AuthProvider", () => {
  // El corazon del incidente: una lectura que nunca llego se contaba igual
  // que una cuenta sin permisos, y el panel decia «Acceso restringido» a un
  // administrador. Sin `profileError` las dos ramas son indistinguibles.
  it("marca error cuando la lectura del perfil falla, sin inventar permisos", async () => {
    mocks.getUserProfile.mockRejectedValue(new Error("offline"));
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("true")
    );
    expect(screen.getByTestId("panel")).toHaveTextContent("false");
    expect(screen.getByTestId("role")).toHaveTextContent("-");
    // Un fallo de lectura no es un alta: el doc existe, solo no se pudo leer.
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("un perfil leido sin permisos NO es un error", async () => {
    mocks.getUserProfile.mockResolvedValue({
      role: "member",
      status: "active",
    });
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("role")).toHaveTextContent("member")
    );
    expect(screen.getByTestId("error")).toHaveTextContent("false");
    expect(screen.getByTestId("panel")).toHaveTextContent("false");
  });

  it("un alta que no llego al servidor tampoco se cuenta como falta de permisos", async () => {
    // api.request() no lanza: devuelve {success:false}. Sin mirarlo, el perfil
    // quedaba en null y se leia como "esta cuenta no puede entrar".
    mocks.getUserProfile.mockResolvedValue(null);
    mocks.register.mockResolvedValue({
      success: false,
      error: "No se pudo conectar con el servidor.",
    });
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("true")
    );
    expect(screen.getByTestId("panel")).toHaveTextContent("false");
  });

  it("retryProfile recupera la sesion cuando vuelve la red, sin recargar", async () => {
    mocks.getUserProfile
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ role: "admin", status: "active" });
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("true")
    );

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() =>
      expect(screen.getByTestId("panel")).toHaveTextContent("true")
    );
    expect(screen.getByTestId("error")).toHaveTextContent("false");
    expect(screen.getByTestId("role")).toHaveTextContent("admin");
  });
});

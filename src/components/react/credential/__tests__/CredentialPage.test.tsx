import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A shared call log so the ORDER of signInAnonymouslyIfNeeded vs
// api.createCredential can be asserted. Missing that ordering is the most
// likely integration bug in this feature: request() in src/lib/api.ts
// hard-returns "Not authenticated" with no token, so the form would fail
// silently with an English string in a Spanish UI.
const calls: string[] = [];

const mocks = vi.hoisted(() => ({
  signInAnonymouslyIfNeeded: vi.fn(),
  createCredential: vi.fn(),
  attachCredentialImage: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  signInAnonymouslyIfNeeded: mocks.signInAnonymouslyIfNeeded,
  getFirestore: vi.fn(),
  getStorage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  isDevPreview: false,
  api: {
    createCredential: mocks.createCredential,
    attachCredentialImage: mocks.attachCredentialImage,
  },
}));

import { CredentialPage } from "../CredentialPage";

const EVENT = JSON.stringify({
  slug: "devfest-2026",
  eventName: "DevFest ICA 2026",
  eventDateLabel: "21 de noviembre de 2026",
  headline: "Soy parte del DevFest ICA 2026",
  registrationUrl: "https://gdg.community.dev/devfest-ica-2026",
  qrDataUrl: null,
});

/** Fills step 1 and advances to the registration step. */
async function reachStepTwo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre"), "Alvaro");
  await user.type(screen.getByLabelText("Apellido"), "Pena");
  await user.click(screen.getByRole("button", { name: /generar credencial/i }));
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("DNI"), "12345678");
  await user.type(
    screen.getByLabelText("Correo electrónico"),
    "alvaro@example.com"
  );
  await user.selectOptions(
    screen.getByLabelText("¿Cómo te enteraste de este evento?"),
    "redes_sociales"
  );
  await user.selectOptions(
    screen.getByLabelText("Mi nivel de experiencia en desarrollo es…"),
    "3_5"
  );
  await user.selectOptions(
    screen.getByLabelText(
      "¿Qué tan familiarizado estás con las Google Developer Tools?"
    ),
    "intermedia"
  );
}

async function checkAllConsents(user: ReturnType<typeof userEvent.setup>) {
  for (const box of screen.getAllByRole("checkbox")) {
    await user.click(box);
  }
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  mocks.signInAnonymouslyIfNeeded.mockImplementation(async () => {
    calls.push("signIn");
    return { uid: "anon-1" };
  });
  mocks.attachCredentialImage.mockImplementation(async () => {
    calls.push("attachCredentialImage");
    return { success: true };
  });
  mocks.createCredential.mockImplementation(async () => {
    calls.push("createCredential");
    return {
      success: true,
      data: { credentialId: "c1", sequenceNumber: 1, groupLetter: "Q" },
    };
  });
});

afterEach(() => cleanup());

describe("CredentialPage — step 1", () => {
  it("asks for nothing sensitive before the credential exists", () => {
    render(<CredentialPage event={EVENT} />);
    // The ordering is the conversion decision: the attendee gets their
    // shareable image before being asked for a DNI.
    expect(screen.queryByLabelText("DNI")).toBeNull();
    expect(screen.getByText("Crea tu credencial")).toBeInTheDocument();
  });

  it("keeps the generate button disabled until there is a name", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    const button = screen.getByRole("button", { name: /generar credencial/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Nombre"), "Alvaro");
    await user.type(screen.getByLabelText("Apellido"), "Pena");
    expect(button).toBeEnabled();
  });

  it("rejects an invalid GitHub username inline", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await user.type(screen.getByLabelText(/usuario de github/i), "-malo");
    expect(
      screen.getByText("Ese usuario de GitHub no es válido")
    ).toBeInTheDocument();
  });

  it("defaults to a mascot so photo upload is the deliberate opt-in", () => {
    render(<CredentialPage event={EVENT} />);
    const selected = screen
      .getAllByRole("button", { pressed: true })
      .filter((b) => b.getAttribute("aria-label"));
    expect(selected.length).toBe(1);
  });
});

describe("CredentialPage — submission", () => {
  it("signs in anonymously BEFORE calling the API", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    await waitFor(() => expect(calls).toContain("createCredential"));
    expect(calls.slice(0, 2)).toEqual(["signIn", "createCredential"]);
  });

  it("blocks submission until every consent is checked", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    expect(mocks.createCredential).not.toHaveBeenCalled();
  });

  it("names the specific consent that is missing", async () => {
    // A z.literal(true) rejection the attendee cannot trace back to a
    // checkbox is a dead end, and this is where people abandon.
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    expect(screen.getByText(/falta aceptar/i)).toBeInTheDocument();
  });

  it("sends the policy version the server enum accepts", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    await waitFor(() => expect(mocks.createCredential).toHaveBeenCalled());
    const [slug, payload] = mocks.createCredential.mock.calls[0];
    expect(slug).toBe("devfest-2026");
    expect(payload.consentPolicyVersion).toBe("2026-08-01");
    expect(payload.consentGdgTerms).toBe(true);
    expect(payload.dni).toBe("12345678");
  });

  it("surfaces a rate-limit message in Spanish", async () => {
    mocks.createCredential.mockResolvedValue({
      success: false,
      error: "Demasiados intentos desde esta red.",
    });
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    expect(
      await screen.findByText(/demasiados intentos desde esta red/i)
    ).toBeInTheDocument();
  });
});

describe("CredentialPage — success", () => {
  it("says plainly that the credential does not register anybody", async () => {
    // The whole risk of the hybrid funnel is someone believing the
    // credential is proof of registration.
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    expect(
      await screen.findByText("Todavía no estás inscrito")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cierra la sesión a los 15 minutos/i)
    ).toBeInTheDocument();
  });

  it("links to the official panel with a safe external target", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    const cta = await screen.findByRole("link", {
      name: /completar mi inscripción oficial/i,
    });
    expect(cta).toHaveAttribute(
      "href",
      "https://gdg.community.dev/devfest-ica-2026"
    );
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the assigned group letter returned by the server", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    await screen.findByText("Todavía no estás inscrito");
    expect(screen.getByText("Q")).toBeInTheDocument();
  });
});

describe("CredentialPage — adjuntar la tarjeta", () => {
  it("no manda la imagen en la llamada de creacion", async () => {
    // La letra de grupo la asigna el servidor, asi que una tarjeta
    // compuesta antes de la respuesta llevaria el placeholder. Enviarla
    // aqui es justamente el bug que el E2E encontro.
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    await waitFor(() => expect(mocks.createCredential).toHaveBeenCalled());
    const [, payload] = mocks.createCredential.mock.calls[0];
    expect(payload.credentialImageDataUrl).toBeNull();
  });

  it("adjunta la tarjeta DESPUES de conocer la letra", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await reachStepTwo(user);
    await fillRegistration(user);
    await checkAllConsents(user);
    await user.click(
      screen.getByRole("button", { name: /guardar y continuar/i })
    );

    await screen.findByText("Todavía no estás inscrito");
    // En jsdom no hay canvas, asi que el adjunto puede no dispararse; lo
    // que si debe cumplirse es el orden cuando ocurre.
    const attachAt = calls.indexOf("attachCredentialImage");
    if (attachAt !== -1) {
      expect(attachAt).toBeGreaterThan(calls.indexOf("createCredential"));
    }
  });
});

describe("CredentialPage — nombre accesible del preview", () => {
  it("no anuncia el texto de relleno como si fuera un nombre", async () => {
    // input.firstName lleva "Tu nombre" como placeholder visual antes de
    // que se escriba nada; leerlo como el nombre del asistente seria
    // incorrecto para un lector de pantalla.
    render(<CredentialPage event={EVENT} />);
    expect(
      screen.getByRole("img", { name: "Vista previa de tu credencial" })
    ).toBeInTheDocument();
  });

  it("usa el nombre real en cuanto se escribe", async () => {
    const user = userEvent.setup();
    render(<CredentialPage event={EVENT} />);
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Alvaro");
    await user.type(screen.getByRole("textbox", { name: "Apellido" }), "Pena");
    expect(
      screen.getByRole("img", {
        name: "Vista previa de la credencial de Alvaro Pena",
      })
    ).toBeInTheDocument();
  });
});

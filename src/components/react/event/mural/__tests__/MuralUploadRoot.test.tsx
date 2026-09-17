import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  uploadMuralPhoto: vi.fn(),
  requestMuralRemoval: vi.fn(),
  prepareMuralPhoto: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    uploadMuralPhoto: mocks.uploadMuralPhoto,
    requestMuralRemoval: mocks.requestMuralRemoval,
  },
}));

vi.mock("@/lib/firebase", () => ({
  signInAnonymouslyIfNeeded: async () => ({ uid: "anon-1" }),
}));

vi.mock("../useMuralSettings", () => ({
  useMuralSettings: () => ({
    settings: {
      state: "open",
      maxPerUid: 10,
      maxTotal: 1500,
      acceptedTotal: 0,
      headline: "Sube tus fotos",
    },
    loading: false,
  }),
}));

vi.mock("../useMyMuralPhotos", () => ({
  useMyMuralPhotos: () => ({ mine: [], loading: false }),
}));

vi.mock("../prepareMuralPhoto", () => ({
  prepareMuralPhoto: mocks.prepareMuralPhoto,
  clientRequestIdFor: (file: File) => `id-${file.name}`,
}));

import { MuralUploadRoot } from "../MuralUploadRoot";

function jpeg(name: string): File {
  return new File([new Uint8Array(8)], name, { type: "image/jpeg" });
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

async function ready() {
  await waitFor(() => expect(fileInput()).toBeInTheDocument());
  await userEvent.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  mocks.uploadMuralPhoto.mockReset();
  mocks.requestMuralRemoval.mockReset();
  mocks.prepareMuralPhoto.mockReset();
  mocks.prepareMuralPhoto.mockResolvedValue({
    dataUrl: "data:image/jpeg;base64,AAAA",
    width: 1600,
    height: 1200,
  });
});

afterEach(cleanup);

describe("MuralUploadRoot", () => {
  it("sube los archivos elegidos, de uno en uno", async () => {
    mocks.uploadMuralPhoto.mockResolvedValue({
      success: true,
      data: { id: "x" },
    });
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await ready();

    await userEvent.upload(fileInput(), [jpeg("a.jpg"), jpeg("b.jpg")]);

    await waitFor(() =>
      expect(mocks.uploadMuralPhoto).toHaveBeenCalledTimes(2)
    );
  });

  /**
   * rate_ip es el ÚNICO tope que se pasa solo. Antes caía al error genérico y
   * el bucle seguía con el resto de archivos, machacando una red que ya estaba
   * diciendo que esperase.
   */
  it("un 429 DETIENE el lote en vez de seguir con los demás", async () => {
    mocks.uploadMuralPhoto.mockResolvedValue({
      success: false,
      code: "rate_ip",
      error: "demasiadas",
    });
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await ready();

    await userEvent.upload(fileInput(), [
      jpeg("a.jpg"),
      jpeg("b.jpg"),
      jpeg("c.jpg"),
    ]);

    await waitFor(() =>
      expect(screen.getByText(/espera unos segundos/i)).toBeInTheDocument()
    );
    expect(mocks.uploadMuralPhoto).toHaveBeenCalledTimes(1);
  });

  it("tras un 429 se puede volver a intentar", async () => {
    mocks.uploadMuralPhoto.mockResolvedValue({
      success: false,
      code: "rate_ip",
      error: "demasiadas",
    });
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await ready();

    await userEvent.upload(fileInput(), [jpeg("a.jpg")]);

    await waitFor(() => expect(fileInput()).not.toBeDisabled());
  });

  /**
   * canvas.toDataURL revienta en Safari iOS con imágenes grandes. Sin
   * try/catch la fase se quedaba en "working" para siempre y el formulario
   * moría hasta recargar la página.
   */
  it("si preparar la foto lanza, el formulario sigue utilizable", async () => {
    mocks.prepareMuralPhoto.mockRejectedValue(new Error("toDataURL"));
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await ready();

    await userEvent.upload(fileInput(), [jpeg("a.jpg")]);

    await waitFor(() =>
      expect(
        screen.getByText(/no pudimos preparar la foto/i)
      ).toBeInTheDocument()
    );
    expect(fileInput()).not.toBeDisabled();
  });

  it("al agotar la cuota deja de ofrecer el selector", async () => {
    mocks.uploadMuralPhoto.mockResolvedValue({
      success: false,
      code: "quota_uid",
      error: "Ya subiste tus 10 fotos.",
    });
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await ready();

    await userEvent.upload(fileInput(), [jpeg("a.jpg")]);

    await waitFor(() =>
      expect(screen.getByText(/ya subiste tus 10 fotos/i)).toBeInTheDocument()
    );
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("manda un id derivado del archivo, no uno aleatorio", async () => {
    mocks.uploadMuralPhoto.mockResolvedValue({
      success: true,
      data: { id: "x" },
    });
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await ready();

    await userEvent.upload(fileInput(), [jpeg("vacaciones.jpg")]);

    await waitFor(() => expect(mocks.uploadMuralPhoto).toHaveBeenCalled());
    expect(mocks.uploadMuralPhoto).toHaveBeenCalledWith(
      "devfest",
      expect.objectContaining({ clientRequestId: "id-vacaciones.jpg" })
    );
  });

  it("no ofrece subir sin marcar el consentimiento", async () => {
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await waitFor(() => expect(fileInput()).toBeInTheDocument());
    expect(fileInput()).toBeDisabled();
  });

  it("no fuerza la cámara: se puede elegir del carrete", async () => {
    render(<MuralUploadRoot slug="devfest" headline="Fotos" />);
    await waitFor(() => expect(fileInput()).toBeInTheDocument());
    expect(fileInput()).not.toHaveAttribute("capture");
  });
});

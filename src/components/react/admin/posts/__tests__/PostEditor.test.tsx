import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  uploadPostImage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  isDevPreview: false,
  api: { uploadPostImage: mocks.uploadPostImage },
}));

import { PostEditor } from "../PostEditor";
import type { Post } from "@/lib/api";

const POST: Post = {
  id: "hola-foro",
  title: "Hola, foro",
  excerpt: "El primero.",
  cover_image_url: "",
  tags: [],
  author_name: "Ana",
  author_photo_url: "",
  published_at: "2026-09-01T10:00:00.000Z",
  status: "published",
  body: "# Hola\n\nUn párrafo.",
};

function setup(props: Partial<Parameters<typeof PostEditor>[0]> = {}) {
  const onSubmit = vi.fn(async () => null);
  const onCancel = vi.fn();
  const onError = vi.fn();
  const view = render(
    <PostEditor
      initial={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onError={onError}
      {...props}
    />
  );
  return { ...view, onSubmit, onCancel, onError };
}

beforeEach(() => {
  mocks.uploadPostImage.mockReset();
});

afterEach(cleanup);

describe("identificador", () => {
  it("lo deriva del título mientras nadie lo toque", async () => {
    setup();
    await userEvent.type(
      screen.getByPlaceholderText("Lo que dejó el DevFest"),
      "Guía de Astro"
    );
    expect(screen.getByDisplayValue("guia-de-astro")).toBeInTheDocument();
  });

  // Quien lo edita a mano manda: seguir reescribiéndolo al teclear el título
  // le borraría lo que puso.
  it("deja de derivarlo en cuanto se edita a mano", async () => {
    const { container } = setup();
    const title = screen.getByPlaceholderText("Lo que dejó el DevFest");
    // El campo del slug no lleva placeholder: es el segundo input de texto.
    const slug =
      container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];

    await userEvent.type(title, "Guía");
    await userEvent.clear(slug);
    await userEvent.type(slug, "mi-slug");
    await userEvent.type(title, " de Astro");

    expect(slug.value).toBe("mi-slug");
  });

  // Cambiarlo rompería el enlace de un post ya compartido.
  it("no se puede cambiar al editar un post existente", () => {
    setup({ initial: POST });
    expect(screen.getByDisplayValue("hola-foro")).toBeDisabled();
  });
});

describe("cuerpo markdown", () => {
  it("previsualiza el markdown renderizado", async () => {
    setup({ initial: POST });
    await userEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    expect(
      screen.getByRole("heading", { name: "Hola", level: 1 })
    ).toBeInTheDocument();
  });

  // El mismo rechazo que aplicará la API, pero mientras se escribe.
  it("avisa del HTML en crudo y bloquea el guardado", async () => {
    const { onSubmit } = setup({
      initial: { ...POST, body: "Hola <script>alert(1)</script>" },
    });

    expect(screen.getByText(/no se admite HTML/i)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Publicar" });
    expect(save).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("acepta HTML dentro de un bloque de código", () => {
    setup({
      initial: { ...POST, body: "```html\n<script>x</script>\n```" },
    });
    expect(screen.queryByText(/no se admite HTML/i)).not.toBeInTheDocument();
  });

  it("la barra inserta markdown en el cuerpo", async () => {
    setup({ initial: { ...POST, body: "" } });
    const body = screen.getByPlaceholderText(/Escribe aquí en markdown/);

    await userEvent.click(screen.getByTitle("Título de sección"));
    expect((body as HTMLTextAreaElement).value).toBe("## ");

    await userEvent.click(screen.getByTitle("Negrita"));
    expect((body as HTMLTextAreaElement).value).toContain("**texto**");
  });
});

describe("imágenes", () => {
  it("sube la imagen e inserta su URL en el markdown", async () => {
    mocks.uploadPostImage.mockResolvedValue({
      success: true,
      data: { path: "posts/images/x.png", url: "https://cdn/x.png" },
    });
    const { container } = setup({ initial: { ...POST, body: "" } });

    const [, bodyInput] =
      container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(
      bodyInput,
      new File(["bytes"], "foto.png", { type: "image/png" })
    );

    await waitFor(() => {
      expect(
        screen.getByDisplayValue(
          "![descripción de la imagen](https://cdn/x.png)"
        )
      ).toBeInTheDocument();
    });
  });

  it("avisa si el formato no se admite, sin llamar a la API", async () => {
    const { container, onError } = setup();
    const [coverInput] =
      container.querySelectorAll<HTMLInputElement>('input[type="file"]');

    await userEvent.upload(
      coverInput,
      new File(["bytes"], "animado.gif", { type: "image/gif" }),
      { applyAccept: false }
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        "Solo se admiten imágenes JPG, PNG o WebP"
      );
    });
    expect(mocks.uploadPostImage).not.toHaveBeenCalled();
  });
});

describe("guardado", () => {
  it("entrega el post al padre", async () => {
    const { onSubmit } = setup({ initial: POST });
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      id: "hola-foro",
      title: "Hola, foro",
      status: "published",
    });
  });

  it("enseña el error que devuelva el padre", async () => {
    const onSubmit = vi.fn(async () => "Ya existe un post con ese id");
    const { onError } = setup({ initial: POST, onSubmit });

    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Ya existe un post con ese id")
    );
  });

  // El flujo de propuestas no decide si algo se publica.
  it("oculta el estado cuando se propone en vez de publicar", () => {
    setup({ showStatus: false, submitLabel: "Enviar a revisión" });
    expect(screen.queryByText("Estado")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar a revisión" })
    ).toBeInTheDocument();
  });
});

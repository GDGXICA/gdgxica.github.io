import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  listPosts: vi.fn(),
  getPost: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  uploadPostImage: vi.fn(),
  can: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  isDevPreview: false,
  api: {
    listPosts: mocks.listPosts,
    getPost: mocks.getPost,
    createPost: mocks.createPost,
    updatePost: mocks.updatePost,
    deletePost: mocks.deletePost,
    uploadPostImage: mocks.uploadPostImage,
  },
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => ({ can: mocks.can }),
}));

import { PostList } from "../PostList";

const SUMMARIES = [
  {
    id: "viejo",
    title: "Un post viejo",
    excerpt: "",
    cover_image_url: "",
    tags: [],
    author_name: "Ana",
    author_photo_url: "",
    published_at: "2026-01-01T10:00:00.000Z",
    status: "published" as const,
  },
  {
    id: "nuevo",
    title: "Un post reciente",
    excerpt: "",
    cover_image_url: "",
    tags: [],
    author_name: "Luis",
    author_photo_url: "",
    published_at: "2026-09-01T10:00:00.000Z",
    status: "draft" as const,
  },
];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.can.mockReturnValue(true);
  mocks.listPosts.mockResolvedValue({ success: true, data: SUMMARIES });
});

afterEach(cleanup);

/** La tabla de escritorio; la versión móvil repite los mismos textos. */
function desktopRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

describe("listado", () => {
  it("ordena por fecha, del más reciente al más viejo", async () => {
    render(<PostList />);
    await screen.findByRole("table");

    const rows = desktopRows();
    expect(rows[0]).toHaveTextContent("Un post reciente");
    expect(rows[1]).toHaveTextContent("Un post viejo");
  });

  it("distingue borrador de publicado", async () => {
    render(<PostList />);
    await screen.findByRole("table");

    expect(desktopRows()[0]).toHaveTextContent("Borrador");
    expect(desktopRows()[1]).toHaveTextContent("Publicado");
  });

  it("enseña el error si la carga falla", async () => {
    mocks.listPosts.mockResolvedValue({
      success: false,
      error: "Sin conexión",
    });
    render(<PostList />);
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
  });

  it("dice que no hay nada cuando el foro está vacío", async () => {
    mocks.listPosts.mockResolvedValue({ success: true, data: [] });
    render(<PostList />);
    expect(
      await screen.findByText("Todavía no hay posts.")
    ).toBeInTheDocument();
  });
});

describe("permisos", () => {
  // Ocultar botones es cosmético —el endpoint vuelve a comprobarlo—, pero
  // enseñar acciones que van a dar 403 es peor que no enseñarlas.
  it("sin posts:write no ofrece crear ni editar", async () => {
    mocks.can.mockImplementation((perm: string) => perm !== "posts:write");
    render(<PostList />);
    await screen.findByRole("table");

    expect(
      screen.queryByRole("button", { name: "+ Nuevo post" })
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "Editar" })).toHaveLength(0);
  });

  it("sin posts:delete no ofrece eliminar", async () => {
    mocks.can.mockImplementation((perm: string) => perm !== "posts:delete");
    render(<PostList />);
    await screen.findByRole("table");

    expect(screen.queryAllByRole("button", { name: "Eliminar" })).toHaveLength(
      0
    );
  });
});

describe("abrir el editor", () => {
  // El índice no trae el cuerpo: editar necesita una segunda llamada.
  it("pide el post completo antes de editarlo", async () => {
    mocks.getPost.mockResolvedValue({
      success: true,
      data: { ...SUMMARIES[1], body: "# Hola" },
    });
    render(<PostList />);
    await screen.findByRole("table");

    await userEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);

    await waitFor(() => expect(mocks.getPost).toHaveBeenCalledWith("nuevo"));
    expect(
      await screen.findByText("Editar: Un post reciente")
    ).toBeInTheDocument();
  });

  it("crea con el formulario vacío", async () => {
    render(<PostList />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "+ Nuevo post" }));

    expect(await screen.findByText("Nuevo post")).toBeInTheDocument();
    expect(mocks.getPost).not.toHaveBeenCalled();
  });
});

describe("eliminar", () => {
  it("pide confirmación y quita la fila", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.deletePost.mockResolvedValue({ success: true });
    render(<PostList />);
    await screen.findByRole("table");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Eliminar" })[0]
    );

    await waitFor(() => expect(mocks.deletePost).toHaveBeenCalledWith("nuevo"));
    await waitFor(() =>
      expect(screen.queryByText("Un post reciente")).not.toBeInTheDocument()
    );
  });

  it("no borra nada si se cancela la confirmación", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PostList />);
    await screen.findByRole("table");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Eliminar" })[0]
    );
    expect(mocks.deletePost).not.toHaveBeenCalled();
  });
});

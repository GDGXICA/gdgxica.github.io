import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn().mockResolvedValue(undefined);
const file = vi.fn(() => ({ save }));

vi.mock("firebase-admin", () => ({
  storage: () => ({ bucket: () => ({ name: "appgdgica.appspot.com", file }) }),
}));

const { decodeImageDataUrl, downloadUrl, saveImageWithToken } =
  await import("./imageStorage");

function dataUrl(mime: string, bytes: number[], padTo = 0): string {
  const body = Buffer.from([
    ...bytes,
    ...new Array(Math.max(0, padTo - bytes.length)).fill(0),
  ]);
  return `data:${mime};base64,${body.toString("base64")}`;
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const WEBP = [
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00,
];

describe("decodeImageDataUrl", () => {
  it("reconoce los tres formatos por sus bytes de cabecera", () => {
    expect(decodeImageDataUrl(dataUrl("image/jpeg", JPEG), 1000)).toMatchObject(
      {
        ext: "jpg",
        contentType: "image/jpeg",
      }
    );
    expect(decodeImageDataUrl(dataUrl("image/png", PNG), 1000)).toMatchObject({
      ext: "png",
      contentType: "image/png",
    });
    expect(decodeImageDataUrl(dataUrl("image/webp", WEBP), 1000)).toMatchObject(
      {
        ext: "webp",
        contentType: "image/webp",
      }
    );
  });

  it("los bytes ganan al MIME declarado", () => {
    expect(decodeImageDataUrl(dataUrl("image/png", JPEG), 1000)).toMatchObject({
      ext: "jpg",
      contentType: "image/jpeg",
    });
  });

  it("rechaza bytes que no son ninguna imagen conocida, se anuncien como se anuncien", () => {
    const html = Buffer.from("<script>alert(1)</script>").toString("base64");
    expect(
      decodeImageDataUrl(`data:image/png;base64,${html}`, 1000)
    ).toBeNull();
  });

  it("rechaza un buffer vacío", () => {
    expect(decodeImageDataUrl("data:image/jpeg;base64,", 1000)).toBeNull();
  });

  it("rechaza por encima del tope de bytes", () => {
    const big = dataUrl("image/jpeg", JPEG, 500);
    expect(decodeImageDataUrl(big, 499)).toBeNull();
    expect(decodeImageDataUrl(big, 500)).not.toBeNull();
  });

  it("rechaza un data URL sin coma", () => {
    expect(decodeImageDataUrl("data:image/jpeg;base64", 1000)).toBeNull();
  });

  it("rechaza base64 corrupto", () => {
    expect(
      decodeImageDataUrl("data:image/jpeg;base64,!!!!!!", 1000)
    ).toBeNull();
  });

  describe("lista blanca de formatos", () => {
    it("admite lo que quien llama pidió", () => {
      expect(
        decodeImageDataUrl(dataUrl("image/jpeg", JPEG), 1000, ["jpg"])
      ).toMatchObject({ ext: "jpg" });
    });

    it("rechaza un formato válido que quien llama NO pidió", () => {
      expect(
        decodeImageDataUrl(dataUrl("image/png", PNG), 1000, ["jpg"])
      ).toBeNull();
      expect(
        decodeImageDataUrl(dataUrl("image/webp", WEBP), 1000, ["jpg"])
      ).toBeNull();
    });

    it("una lista vacía no admite nada", () => {
      expect(
        decodeImageDataUrl(dataUrl("image/jpeg", JPEG), 1000, [])
      ).toBeNull();
    });
  });
});

describe("downloadUrl", () => {
  it("codifica las barras del path, que es lo que exige la API v0", () => {
    const url = downloadUrl("bucket.appspot.com", "posts/images/a.jpg", "tok");
    expect(url).toContain("/o/posts%2Fimages%2Fa.jpg?alt=media&token=tok");
  });
});

describe("saveImageWithToken", () => {
  beforeEach(() => {
    save.mockClear();
    file.mockClear();
  });

  it("guarda en el path que le dan, con el contentType salido de los bytes", async () => {
    const image = decodeImageDataUrl(dataUrl("image/png", JPEG), 1000)!;
    const stored = await saveImageWithToken(image, "mural/devfest/abc.jpg");

    expect(file).toHaveBeenCalledWith("mural/devfest/abc.jpg");
    expect(stored.path).toBe("mural/devfest/abc.jpg");

    expect(save.mock.calls[0][1].contentType).toBe("image/jpeg");
  });

  it("el token de descarga no es derivable del path", async () => {
    const image = decodeImageDataUrl(dataUrl("image/jpeg", JPEG), 1000)!;
    const stored = await saveImageWithToken(image, "mural/devfest/abc.jpg");

    const token = save.mock.calls[0][1].metadata.metadata
      .firebaseStorageDownloadTokens as string;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored.path).not.toContain(token);
    expect(stored.url).toContain(`token=${token}`);
  });

  it("acepta un cacheControl propio y por defecto es inmutable", async () => {
    const image = decodeImageDataUrl(dataUrl("image/jpeg", JPEG), 1000)!;

    await saveImageWithToken(image, "a.jpg");
    expect(save.mock.calls[0][1].metadata.cacheControl).toBe(
      "public, max-age=31536000, immutable"
    );

    await saveImageWithToken(image, "b.jpg", {
      cacheControl: "private, max-age=0",
    });
    expect(save.mock.calls[1][1].metadata.cacheControl).toBe(
      "private, max-age=0"
    );
  });
});

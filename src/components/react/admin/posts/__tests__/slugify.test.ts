import { describe, expect, it } from "vitest";
import { slugify, slugifyWhileTyping } from "../slugify";

describe("slugify", () => {
  it("pasa un título normal a slug", () => {
    expect(slugify("Lo que dejó el DevFest 2026")).toBe(
      "lo-que-dejo-el-devfest-2026"
    );
  });

  it("quita tildes y eñes", () => {
    expect(slugify("Diseño de una canción")).toBe("diseno-de-una-cancion");
  });

  it("colapsa signos y espacios en un solo guion", () => {
    expect(slugify("¿Qué es Firebase?  ¡Vamos!")).toBe("que-es-firebase-vamos");
  });

  it("no deja guiones sueltos en los extremos", () => {
    expect(slugify("  — Hola —  ")).toBe("hola");
  });

  it("descarta lo que no sabe transliterar", () => {
    expect(slugify("🎉 Fiesta 🎉")).toBe("fiesta");
  });

  // El servidor corta en 100 caracteres, y un slug terminado en guion es feo
  // en una URL.
  it("recorta a 100 sin dejar un guion final", () => {
    const slug = slugify("palabra ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("devuelve vacío cuando no queda nada utilizable", () => {
    expect(slugify("🎉")).toBe("");
  });
});

describe("slugifyWhileTyping", () => {
  // Sin esto, el guion desaparecía en cuanto se tecleaba y salía "mislug".
  it("deja escribir un guion", () => {
    expect(slugifyWhileTyping("mi-")).toBe("mi-");
    expect(slugifyWhileTyping("mi-slug")).toBe("mi-slug");
  });

  it("convierte el espacio final en guion", () => {
    expect(slugifyWhileTyping("mi ")).toBe("mi-");
  });

  it("no empieza por guion", () => {
    expect(slugifyWhileTyping("-")).toBe("");
  });
});

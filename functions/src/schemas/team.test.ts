import { describe, expect, it } from "vitest";
import { teamMemberSchema } from "./index";

function validMember(over: Record<string, unknown> = {}) {
  return {
    id: "alvaro-pena",
    name: "Álvaro Peña",
    role: "Organizador",
    photo_url: "/team/alvaro.webp",
    bio: "Community lead en GDG ICA.",
    social_links: { github: "https://github.com/aalvaropc" },
    type: "organizer",
    ...over,
  };
}

describe("teamMemberSchema", () => {
  it("acepta un miembro sin is_active", () => {
    expect(teamMemberSchema.safeParse(validMember()).success).toBe(true);
  });

  it("acepta el is_active que reenvía el panel", () => {
    for (const valor of [true, false]) {
      const parsed = teamMemberSchema.safeParse(
        validMember({ is_active: valor })
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.is_active).toBe(valor);
    }
  });

  it("no inventa is_active cuando no venía", () => {
    const parsed = teamMemberSchema.safeParse(validMember());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("is_active" in parsed.data).toBe(false);
  });

  it("rechaza un is_active que no es booleano", () => {
    expect(
      teamMemberSchema.safeParse(validMember({ is_active: "true" })).success
    ).toBe(false);
  });

  it("sigue rechazando campos fuera de la lista", () => {
    expect(
      teamMemberSchema.safeParse(validMember({ is_activo_typo: true })).success
    ).toBe(false);
  });

  it("exige los campos obligatorios", () => {
    for (const campo of ["id", "name", "type"]) {
      const incompleto = validMember();
      delete (incompleto as Record<string, unknown>)[campo];
      expect(teamMemberSchema.safeParse(incompleto).success).toBe(false);
    }
  });

  it("acota el tipo a organizer o member", () => {
    expect(
      teamMemberSchema.safeParse(validMember({ type: "admin" })).success
    ).toBe(false);
  });
});

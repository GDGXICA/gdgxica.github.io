import { describe, expect, it } from "vitest";
import { describeAction, describeChange } from "../describe";

describe("describeAction", () => {
  it("names the known actions in plain Spanish", () => {
    expect(describeAction("user.role.change")).toEqual({
      kind: "sentence",
      text: "cambió el rol de",
    });
  });

  it("composes create/update/delete for known resources", () => {
    expect(describeAction("speaker.delete")).toEqual({
      kind: "sentence",
      text: "eliminó el speaker",
    });
    expect(describeAction("minigame_template.create").text).toBe(
      "creó la plantilla de minijuego"
    );
  });

  it("labels security events instead of describing them as acts", () => {
    expect(describeAction("security.permission.denied")).toEqual({
      kind: "security",
      text: "Intento sin permiso",
    });
  });

  it("falls back to the raw key for actions it does not know", () => {
    expect(describeAction("minigame_instance.bingo.draw")).toEqual({
      kind: "raw",
      text: "minigame_instance.bingo.draw",
    });
  });
});

describe("describeChange", () => {
  it("reads a role change with its labels", () => {
    expect(
      describeChange({ previousRole: "member", newRole: "volunteer" })
    ).toBe("de Miembro a Voluntario de evento");
  });

  it("reads a status change", () => {
    expect(
      describeChange({ previousStatus: "active", newStatus: "suspended" })
    ).toBe("de activo a suspendido");
  });

  it("says nothing when the details carry no change", () => {
    expect(describeChange({ title: "DevFest ICA 2026" })).toBeNull();
    expect(describeChange(undefined)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { canAccessPanel, canReachByAssignment } from "../permissions";

/**
 * `canReachByAssignment` no tiene equivalente en el servidor —allí el alcance
 * llega en la petición— así que el test de deriva de
 * `functions/src/auth/permissions.test.ts` no la cubre. Se prueba aquí.
 *
 * Lo que decide: si el menú y el guard de página dejan pasar a alguien cuyos
 * permisos son todos `perEvent`. `can()` evalúa a alcance GLOBAL, donde un
 * voluntario no tiene ninguno, así que sin esto veía solo el dashboard.
 */
describe("canReachByAssignment", () => {
  it("deja al voluntario alcanzar lo que su rol da por evento", () => {
    const volunteer = { role: "volunteer" };
    expect(canReachByAssignment(volunteer, "roster:read")).toBe(true);
    expect(canReachByAssignment(volunteer, "checkin:operate")).toBe(true);
    expect(canReachByAssignment(volunteer, "minigames:operate")).toBe(true);
    expect(canReachByAssignment(volunteer, "credentials:operate")).toBe(true);
  });

  // La puerta es por PERMISO, no por página: un permiso que el rol no tiene ni
  // por asignación no se alcanza por estar asignado a un evento.
  it("no le deja alcanzar lo que su rol no da", () => {
    const volunteer = { role: "volunteer" };
    expect(canReachByAssignment(volunteer, "events:read")).toBe(false);
    expect(canReachByAssignment(volunteer, "users:read")).toBe(false);
    expect(canReachByAssignment(volunteer, "credentials:moderate")).toBe(false);
  });

  // Un organizador ya los tiene a alcance global, así que `can()` responde por
  // él y esta vía no le añade nada.
  it("es falsa para roles sin permisos por evento", () => {
    expect(canReachByAssignment({ role: "organizer" }, "roster:read")).toBe(
      false
    );
    expect(canReachByAssignment({ role: "member" }, "roster:read")).toBe(false);
    expect(canReachByAssignment({ role: "contributor" }, "roster:read")).toBe(
      false
    );
  });

  // La suspensión es la palanca de emergencia: corta todo, también esta vía.
  it("no deja pasar a una cuenta suspendida", () => {
    expect(
      canReachByAssignment(
        { role: "volunteer", status: "suspended" },
        "roster:read"
      )
    ).toBe(false);
  });

  it("trata un rol corrupto como member", () => {
    expect(canReachByAssignment({ role: "superadmin" }, "roster:read")).toBe(
      false
    );
    expect(canReachByAssignment({}, "roster:read")).toBe(false);
  });
});

describe("canAccessPanel", () => {
  // Un voluntario entra al panel para llegar a los eventos que tiene
  // asignados, aunque a alcance global no tenga ni un permiso.
  it("deja entrar al voluntario", () => {
    expect(canAccessPanel({ role: "volunteer" })).toBe(true);
  });

  it("no deja entrar a un miembro", () => {
    expect(canAccessPanel({ role: "member" })).toBe(false);
  });

  it("no deja entrar a un voluntario suspendido", () => {
    expect(canAccessPanel({ role: "volunteer", status: "suspended" })).toBe(
      false
    );
  });
});

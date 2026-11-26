import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  RULES_ENFORCED_PERMISSIONS,
  ROLES,
  ROLE_BUNDLES,
  canAssignRole,
  canGrant,
  effectivePermissions,
  hasPermission,
  isGrantActive,
  roleCanScopePermission,
  LEGACY_STAFF_PERMISSIONS,
  STAFF_CAPABILITIES,
  STAFF_CAPABILITY_IDS,
  capabilitiesFromPermissions,
  permissionsForCapabilities,
  readStaffPermissions,
  type Permission,
} from "./permissions";
import * as client from "../../../src/lib/permissions";

const NOW = Date.UTC(2026, 6, 25);
const HOUR = 60 * 60 * 1000;

describe("catálogo", () => {
  it("no tiene permisos duplicados ni roles duplicados", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  it("todo permiso de un bundle existe en el catálogo", () => {
    for (const role of ROLES) {
      const bundle = ROLE_BUNDLES[role];
      for (const perm of [...bundle.global, ...bundle.perEvent]) {
        expect(PERMISSIONS).toContain(perm);
      }
    }
  });

  // Si esta lista nombra un permiso que ya no existe, la advertencia de la UI
  // deja de salir en silencio y nadie se entera hasta que alguien concede un
  // grant que no sirve para nada.
  it("los permisos aplicados por las reglas existen en el catálogo", () => {
    for (const perm of RULES_ENFORCED_PERMISSIONS) {
      expect(PERMISSIONS).toContain(perm);
    }
  });

  it("admin posee todos los permisos", () => {
    expect([...effectivePermissions({ role: "admin" })].sort()).toEqual(
      [...PERMISSIONS].sort()
    );
  });

  it("member no posee ninguno", () => {
    expect(effectivePermissions({ role: "member" }).size).toBe(0);
  });
});

// El panel se rompe de forma silenciosa y peligrosa si el espejo de cliente
// concede más que el servidor: la UI mostraría acciones que luego dan 403, o
// peor, ocultaría restricciones reales.
describe("sincronía con el espejo de cliente", () => {
  it("expone el mismo catálogo de permisos y roles", () => {
    expect([...client.PERMISSIONS]).toEqual([...PERMISSIONS]);
    expect([...client.ROLES]).toEqual([...ROLES]);
  });

  it("expone la misma lista de permisos aplicados por las reglas", () => {
    expect([...client.RULES_ENFORCED_PERMISSIONS]).toEqual([
      ...RULES_ENFORCED_PERMISSIONS,
    ]);
  });

  it("expone los mismos bundles por rol", () => {
    for (const role of ROLES) {
      expect([...client.ROLE_BUNDLES[role].global]).toEqual([
        ...ROLE_BUNDLES[role].global,
      ]);
      expect([...client.ROLE_BUNDLES[role].perEvent]).toEqual([
        ...ROLE_BUNDLES[role].perEvent,
      ]);
    }
  });

  it("evalúa igual que el servidor en los casos que pinta la UI", () => {
    const subjects = [
      { role: "member" },
      { role: "contributor" },
      { role: "volunteer" },
      { role: "organizer" },
      { role: "admin" },
      { role: "admin", status: "suspended" },
      {
        role: "member",
        grants: [{ permission: "roster:read", scope: "*" }],
      },
    ];
    for (const subject of subjects) {
      expect(
        [...client.effectivePermissions(subject, { nowMs: NOW })].sort()
      ).toEqual([...effectivePermissions(subject, { nowMs: NOW })].sort());
    }
  });

  it("tiene una etiqueta y una descripción por rol", () => {
    for (const role of ROLES) {
      expect(client.ROLE_LABELS[role]).toBeTruthy();
      expect(client.ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });
});

// Las reglas no pueden importar el catálogo, así que `roleHasGlobal` y
// `roleHasPerEvent` repiten a mano qué permisos aplicados por las reglas tiene
// cada rol. Una lista desviada abre o cierra datos personales sin que ningún
// otro test lo note: esto lee las listas de los dos archivos de reglas y las
// compara con los bundles.
describe("sincronía con las reglas", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const enforced = new Set<string>(RULES_ENFORCED_PERMISSIONS);

  function ruleList(file: string, fn: string, role: string): string[] {
    const source = readFileSync(join(ROOT, file), "utf8");
    const body = source.match(
      new RegExp(`function ${fn}\\(role, perm\\) \\{([\\s\\S]*?)\\n\\s*\\}`)
    );
    expect(body, `${fn} en ${file}`).not.toBeNull();
    const list = body![1].match(
      new RegExp(`role == '${role}'\\s*&&\\s*perm in \\[([^\\]]*)\\]`)
    );
    expect(list, `${role} en ${fn} de ${file}`).not.toBeNull();
    return [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  }

  const expected = (perms: readonly Permission[]) =>
    perms.filter((p) => enforced.has(p)).sort();

  function legacyList(file: string): string[] {
    const source = readFileSync(join(ROOT, file), "utf8");
    const body = source.match(
      /function legacyStaffHas\(perm\) \{\s*return perm in \[([^\]]*)\]/
    );
    expect(body, `legacyStaffHas en ${file}`).not.toBeNull();
    return [...body![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  }

  for (const file of ["firestore.rules", "storage.rules"]) {
    it(`${file}: las asignaciones sin lista conceden lo mismo que en el código`, () => {
      expect(legacyList(file)).toEqual(expected(LEGACY_STAFF_PERMISSIONS));
    });

    it(`${file}: el organizador tiene los mismos permisos globales`, () => {
      expect(ruleList(file, "roleHasGlobal", "organizer")).toEqual(
        expected(ROLE_BUNDLES.organizer.global)
      );
    });

    it(`${file}: el voluntario tiene los mismos permisos por evento`, () => {
      expect(ruleList(file, "roleHasPerEvent", "volunteer")).toEqual(
        expected(ROLE_BUNDLES.volunteer.perEvent)
      );
    });
  }

  it("ningún otro rol concede permisos aplicados por las reglas", () => {
    for (const role of ROLES) {
      if (role === "organizer" || role === "volunteer" || role === "admin")
        continue;
      const bundle = ROLE_BUNDLES[role];
      expect(
        [...bundle.global, ...bundle.perEvent].filter((p) => enforced.has(p))
      ).toEqual([]);
    }
  });
});

// Lo que un admin elige al asignar a alguien a un evento.
describe("capacidades de staff", () => {
  it("juntas son exactamente el paquete por evento del voluntario", () => {
    expect(permissionsForCapabilities(STAFF_CAPABILITY_IDS)).toEqual(
      [...ROLE_BUNDLES.volunteer.perEvent].sort()
    );
  });

  it("cada una trae lo que necesita para funcionar", () => {
    // Marcar asistencia sin poder leer el roster deja la pantalla vacía.
    expect(STAFF_CAPABILITIES.checkin).toContain("roster:read");
    expect(STAFF_CAPABILITIES.credentials).toContain("credentials:read");
  });

  it("se reconstruyen desde los permisos guardados", () => {
    const perms = permissionsForCapabilities(["checkin", "mural"]);
    expect(capabilitiesFromPermissions(perms)).toEqual(["checkin", "mural"]);
    // Sin lista: lo que concedían las asignaciones antes de las capacidades.
    expect(capabilitiesFromPermissions(null)).toEqual([
      "checkin",
      "minigames",
      "credentials",
    ]);
    // Una capacidad a medias no cuenta como elegida.
    expect(capabilitiesFromPermissions(["roster:read"])).toEqual([]);
  });

  it("leen la lista del doc de staff fallando cerrado", () => {
    expect(readStaffPermissions(undefined)).toBeNull();
    expect(readStaffPermissions(null)).toBeNull();
    expect(readStaffPermissions(["roster:read", "inventado"])).toEqual([
      "roster:read",
    ]);
    expect(readStaffPermissions("roster:read")).toEqual([]);
    expect(readStaffPermissions({ 0: "roster:read" })).toEqual([]);
  });
});

describe("asignación acotada", () => {
  const volunteer = { role: "volunteer" };
  const at = (staffPermissions: readonly Permission[] | null) =>
    effectivePermissions(volunteer, {
      scope: "devfest",
      isEventStaff: true,
      staffPermissions,
    });

  // Congelado: que el paquete crezca no amplía a quien ya estaba asignado.
  it("sin lista concede lo de antes de las capacidades, sin el mural", () => {
    expect([...at(null)].sort()).toEqual([...LEGACY_STAFF_PERMISSIONS].sort());
    expect(at(null).has("mural:moderate")).toBe(false);
  });

  it("lo congelado cabe en el paquete actual", () => {
    for (const perm of LEGACY_STAFF_PERMISSIONS) {
      expect(ROLE_BUNDLES.volunteer.perEvent).toContain(perm);
    }
  });

  it("con lista concede solo lo que nombra", () => {
    const perms = at(permissionsForCapabilities(["mural"]));
    expect([...perms]).toEqual(["mural:moderate"]);
    expect(perms.has("roster:read")).toBe(false);
    expect(perms.has("checkin:operate")).toBe(false);
  });

  it("una lista vacía no concede nada", () => {
    expect(at([]).size).toBe(0);
  });

  it("nunca añade lo que el rol no tiene por evento", () => {
    expect(at(["minigames:manage", "mural:manage", "users:read"]).size).toBe(0);
  });

  it("no concede nada fuera del evento, aunque la lista lo nombre", () => {
    expect(
      effectivePermissions(volunteer, {
        scope: "*",
        isEventStaff: true,
        staffPermissions: ["roster:read"],
      }).size
    ).toBe(0);
  });

  it("las revocaciones siguen restando", () => {
    const perms = effectivePermissions(
      { role: "volunteer", revocations: ["checkin:operate"] },
      {
        scope: "devfest",
        isEventStaff: true,
        staffPermissions: permissionsForCapabilities(["checkin"]),
      }
    );
    expect([...perms]).toEqual(["roster:read"]);
  });

  it("el espejo de cliente evalúa igual a nivel de evento", () => {
    const cases: [object, readonly Permission[] | null][] = [
      [volunteer, null],
      [volunteer, permissionsForCapabilities(["checkin"])],
      [volunteer, permissionsForCapabilities(["minigames", "mural"])],
      [
        { role: "volunteer", revocations: ["mural:moderate"] },
        ["mural:moderate"],
      ],
      [{ role: "organizer" }, ["mural:moderate"]],
    ];
    for (const [subject, staffPermissions] of cases) {
      const ctx = {
        scope: "devfest",
        isEventStaff: true,
        staffPermissions,
        nowMs: NOW,
      };
      expect([...client.effectivePermissions(subject, ctx)].sort()).toEqual(
        [...effectivePermissions(subject, ctx)].sort()
      );
    }
  });

  it("el espejo de cliente expone las mismas capacidades", () => {
    expect(client.STAFF_CAPABILITIES).toEqual(STAFF_CAPABILITIES);
    for (const cap of STAFF_CAPABILITY_IDS) {
      expect(client.STAFF_CAPABILITY_LABELS[cap].label).toBeTruthy();
      expect(client.STAFF_CAPABILITY_LABELS[cap].description).toBeTruthy();
    }
  });
});

describe("suspensión", () => {
  it("deja sin permisos a un admin suspendido", () => {
    expect(
      effectivePermissions({ role: "admin", status: "suspended" }).size
    ).toBe(0);
  });

  it("ignora incluso los grants directos", () => {
    const subject = {
      role: "member",
      status: "suspended",
      grants: [{ permission: "roster:read", scope: "*" }],
    };
    expect(hasPermission(subject, "roster:read")).toBe(false);
  });
});

describe("alcance por evento", () => {
  const volunteer = { role: "volunteer" };

  it("no concede nada a alcance global", () => {
    expect(effectivePermissions(volunteer).size).toBe(0);
    expect(hasPermission(volunteer, "roster:read")).toBe(false);
  });

  it("no concede nada en un evento donde no es staff", () => {
    expect(
      hasPermission(volunteer, "roster:read", {
        scope: "devfest-2025",
        isEventStaff: false,
      })
    ).toBe(false);
  });

  it("concede sus permisos en el evento donde sí es staff", () => {
    expect(
      hasPermission(volunteer, "roster:read", {
        scope: "devfest-2025",
        isEventStaff: true,
      })
    ).toBe(true);
    expect(
      hasPermission(volunteer, "checkin:operate", {
        scope: "devfest-2025",
        isEventStaff: true,
      })
    ).toBe(true);
  });

  it("nunca concede permisos fuera de su bundle aunque sea staff", () => {
    expect(
      hasPermission(volunteer, "events:write", {
        scope: "devfest-2025",
        isEventStaff: true,
      })
    ).toBe(false);
  });

  it("roleCanScopePermission indica cuándo vale la pena leer staff", () => {
    expect(roleCanScopePermission(volunteer, "roster:read")).toBe(true);
    expect(roleCanScopePermission(volunteer, "events:write")).toBe(false);
    expect(roleCanScopePermission({ role: "organizer" }, "roster:read")).toBe(
      false
    );
  });
});

describe("grants", () => {
  it("un grant global sirve para cualquier alcance", () => {
    const subject = {
      role: "member",
      grants: [{ permission: "roster:read", scope: "*" }],
    };
    expect(hasPermission(subject, "roster:read", { nowMs: NOW })).toBe(true);
    expect(
      hasPermission(subject, "roster:read", {
        scope: "devfest-2025",
        nowMs: NOW,
      })
    ).toBe(true);
  });

  it("un grant acotado solo sirve en su evento", () => {
    const subject = {
      role: "member",
      grants: [{ permission: "roster:read", scope: "devfest-2025" }],
    };
    expect(
      hasPermission(subject, "roster:read", {
        scope: "devfest-2025",
        nowMs: NOW,
      })
    ).toBe(true);
    expect(
      hasPermission(subject, "roster:read", {
        scope: "otro-evento",
        nowMs: NOW,
      })
    ).toBe(false);
    expect(hasPermission(subject, "roster:read", { nowMs: NOW })).toBe(false);
  });

  it("un grant vencido no concede acceso", () => {
    const subject = {
      role: "member",
      grants: [
        {
          permission: "roster:read" as Permission,
          scope: "*",
          expiresAt: NOW - HOUR,
        },
      ],
    };
    expect(hasPermission(subject, "roster:read", { nowMs: NOW })).toBe(false);
  });

  it("un grant vigente sí, y deja de valer al cruzar su caducidad", () => {
    const grant = {
      permission: "roster:read" as Permission,
      scope: "*",
      expiresAt: NOW + HOUR,
    };
    expect(isGrantActive(grant, NOW)).toBe(true);
    expect(isGrantActive(grant, NOW + 2 * HOUR)).toBe(false);
  });

  it("una fecha de caducidad ilegible se trata como vencida", () => {
    const grant = {
      permission: "roster:read" as Permission,
      scope: "*",
      expiresAt: "no-es-una-fecha",
    };
    expect(isGrantActive(grant, NOW)).toBe(false);
  });

  it("acepta Timestamp de Firestore y Date", () => {
    const asTimestamp = {
      permission: "roster:read" as Permission,
      scope: "*",
      expiresAt: { toMillis: () => NOW + HOUR },
    };
    const asDate = {
      permission: "roster:read" as Permission,
      scope: "*",
      expiresAt: new Date(NOW + HOUR),
    };
    expect(isGrantActive(asTimestamp, NOW)).toBe(true);
    expect(isGrantActive(asDate, NOW)).toBe(true);
  });

  it("descarta grants con permisos inventados", () => {
    const subject = {
      role: "member",
      grants: [{ permission: "todo:todo", scope: "*" }],
    };
    expect(effectivePermissions(subject, { nowMs: NOW }).size).toBe(0);
  });

  it("tolera un campo grants corrupto sin lanzar", () => {
    expect(effectivePermissions({ role: "member", grants: "nope" }).size).toBe(
      0
    );
    expect(
      effectivePermissions({ role: "member", grants: [null, 42] }).size
    ).toBe(0);
  });
});

describe("revocations", () => {
  it("resta un permiso del bundle del rol", () => {
    const subject = { role: "organizer", revocations: ["roster:read"] };
    expect(hasPermission(subject, "roster:read")).toBe(false);
    expect(hasPermission(subject, "events:write")).toBe(true);
  });

  it("gana sobre un grant directo", () => {
    const subject = {
      role: "member",
      grants: [{ permission: "roster:read", scope: "*" }],
      revocations: ["roster:read"],
    };
    expect(hasPermission(subject, "roster:read", { nowMs: NOW })).toBe(false);
  });
});

describe("rol desconocido", () => {
  it("degrada a member en vez de conceder de más", () => {
    expect(effectivePermissions({ role: "superadmin" }).size).toBe(0);
    expect(effectivePermissions({}).size).toBe(0);
    expect(effectivePermissions({ role: null }).size).toBe(0);
  });
});

describe("no escalada", () => {
  /** Permisos efectivos de un rol limpio, que es lo que reciben las guardas. */
  const permsOf = (subject: object) => effectivePermissions(subject);

  it("un organizador no puede otorgar permisos que no tiene", () => {
    const organizer = permsOf({ role: "organizer" });
    expect(canGrant(organizer, "roster:read")).toBe(true);
    expect(canGrant(organizer, "users:role:write")).toBe(false);
    expect(canGrant(organizer, "audit:read")).toBe(false);
  });

  it("un organizador no puede nombrar admin", () => {
    expect(canAssignRole(permsOf({ role: "organizer" }), "admin")).toBe(false);
  });

  // `organizer` contiene a `contributor` y a `volunteer`, así que puede dar
  // de alta a ambos. Si no fuera así, la regla de no escalada le impediría
  // incorporar justo a los perfiles que más va a incorporar.
  it("un organizador sí puede nombrar contributor, volunteer y member", () => {
    const organizer = permsOf({ role: "organizer" });
    expect(canAssignRole(organizer, "contributor")).toBe(true);
    expect(canAssignRole(organizer, "volunteer")).toBe(true);
    expect(canAssignRole(organizer, "member")).toBe(true);
  });

  it("un voluntario no puede nombrar organizador", () => {
    expect(canAssignRole(permsOf({ role: "volunteer" }), "organizer")).toBe(
      false
    );
  });

  it("un admin puede nombrar cualquier rol", () => {
    const admin = permsOf({ role: "admin" });
    for (const role of ROLES) {
      expect(canAssignRole(admin, role)).toBe(true);
    }
  });

  it("un admin suspendido no puede otorgar nada", () => {
    const suspended = permsOf({ role: "admin", status: "suspended" });
    expect(canGrant(suspended, "events:read")).toBe(false);
    // `member` no otorga ningún permiso, así que asignarlo no exige poseer
    // nada: degradar a alguien nunca es una escalada.
    expect(canAssignRole(suspended, "member")).toBe(true);
  });

  // El motivo del cambio de firma: derivar los permisos del ROL dentro de la
  // guarda ignoraba las revocations del actor, y quien tuviera un permiso
  // retirado podía concedérselo a otra persona y recuperarlo por ahí.
  it("una revocación del actor le impide otorgar ese permiso", () => {
    const admin = permsOf({ role: "admin", revocations: ["audit:read"] });
    expect(canGrant(admin, "audit:read")).toBe(false);
    expect(canGrant(admin, "users:read")).toBe(true);
  });

  it("un permiso concedido sí habilita a otorgarlo", () => {
    const organizer = permsOf({
      role: "organizer",
      grants: [{ permission: "audit:read", scope: "*" }],
    });
    expect(canGrant(organizer, "audit:read")).toBe(true);
  });
});

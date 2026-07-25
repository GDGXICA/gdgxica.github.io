import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLES,
  ROLE_BUNDLES,
  canAssignRole,
  canGrant,
  effectivePermissions,
  hasPermission,
  isGrantActive,
  roleCanScopePermission,
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
  it("un organizador no puede otorgar permisos que no tiene", () => {
    const organizer = { role: "organizer" };
    expect(canGrant(organizer, "roster:read")).toBe(true);
    expect(canGrant(organizer, "users:role:write")).toBe(false);
    expect(canGrant(organizer, "audit:read")).toBe(false);
  });

  it("un organizador no puede nombrar admin ni organizador", () => {
    const organizer = { role: "organizer" };
    expect(canAssignRole(organizer, "admin")).toBe(false);
    expect(canAssignRole(organizer, "member")).toBe(true);
    expect(canAssignRole(organizer, "contributor")).toBe(false);
  });

  it("un admin puede nombrar cualquier rol", () => {
    const admin = { role: "admin" };
    for (const role of ROLES) {
      expect(canAssignRole(admin, role)).toBe(true);
    }
  });

  it("un admin suspendido no puede otorgar nada", () => {
    const suspended = { role: "admin", status: "suspended" };
    expect(canGrant(suspended, "events:read")).toBe(false);
    expect(canAssignRole(suspended, "member")).toBe(true);
  });
});

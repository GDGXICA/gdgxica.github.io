import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  SECURITY_ACTIONS,
  type AuditAction,
} from "./auditActions";

/**
 * El registro de acciones se mantiene honesto de dos formas.
 *
 * El compilador ya impide EMITIR una acción que no esté en la lista — eso lo
 * garantiza el tipo `AuditAction` y no hace falta probarlo aquí. Lo que el
 * compilador no puede ver es lo contrario: una entrada que sobra. Cuando una
 * acción se renombra o se deja de emitir, su nombre viejo se queda en la lista
 * y nada se queja, y a partir de ahí el registro documenta una acción que el
 * código ya no produce. Quien lea la lista para saber qué se audita se lleva
 * una respuesta falsa.
 */

const SRC = join(__dirname, "..");

/** Todo el código de producción, en un solo string. */
function productionSources(): string {
  const chunks: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        // El propio registro menciona todos los nombres por definición.
        entry.name !== "auditActions.ts"
      ) {
        chunks.push(readFileSync(path, "utf8"));
      }
    }
  };
  walk(SRC);
  return chunks.join("\n");
}

describe("registro de acciones", () => {
  const sources = productionSources();

  it("no hay duplicados", () => {
    const all = [...AUDIT_ACTIONS, ...SECURITY_ACTIONS];
    const dupes = all.filter((a, i) => all.indexOf(a) !== i);
    expect(dupes).toEqual([]);
  });

  it("las acciones de dominio y de seguridad no se solapan", () => {
    const overlap = (AUDIT_ACTIONS as readonly string[]).filter((a) =>
      (SECURITY_ACTIONS as readonly string[]).includes(a)
    );
    expect(overlap).toEqual([]);
  });

  // Una entrada que ya nadie emite es peor que una que falta: la que falta no
  // compila, ésta se queda documentando algo que no ocurre.
  it("toda acción de dominio registrada se emite en algún sitio", () => {
    const stale = AUDIT_ACTIONS.filter((a) => !sources.includes(`"${a}"`));
    expect(
      stale,
      "Acción registrada que ningún handler emite. Si se renombró, quítala."
    ).toEqual([]);
  });

  it("todo evento de seguridad registrado se emite en algún sitio", () => {
    const stale = SECURITY_ACTIONS.filter((a) => !sources.includes(`"${a}"`));
    expect(stale).toEqual([]);
  });

  it("los prefijos son coherentes", () => {
    for (const action of SECURITY_ACTIONS) {
      expect(action.startsWith("security.")).toBe(true);
    }
    for (const action of AUDIT_ACTIONS) {
      expect(action.startsWith("security.")).toBe(false);
      // Dos segmentos mínimo: el prefijo es lo que determina la categoría.
      expect(action.split(".").length).toBeGreaterThanOrEqual(2);
    }
  });

  // Los estados vienen de `minigameStateSchema` en schemas/index.ts. Si alguien
  // añade un estado allí sin tocar el tipo, esto deja de compilar — que es
  // exactamente lo que se quiere que pase.
  it("acepta las tres acciones de cambio de estado", () => {
    const acciones: AuditAction[] = [
      "minigame_instance.state.scheduled",
      "minigame_instance.state.live",
      "minigame_instance.state.closed",
    ];
    expect(acciones).toHaveLength(3);
  });

  it("acepta las filas sintéticas de la red de seguridad", () => {
    const fila: AuditAction = "http.post./api/algo";
    expect(fila.startsWith("http.")).toBe(true);
  });
});

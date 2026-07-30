import { describe, expect, it } from "vitest";
import { statsSchema } from "./index";

/**
 * `PUT /api/stats` era la única escritura de la API sin esquema. El handler
 * cogía `req.body` entero, lo esparcía en `about/stats.json` del repo de datos
 * y lo metía tal cual en los detalles de auditoría.
 */

/** Cuerpo válido: lo que manda el panel. */
function validStats(over: Record<string, unknown> = {}) {
  return {
    total_members: 1200,
    total_events: 48,
    total_talks: 96,
    total_speakers: 60,
    years_active: 7,
    total_organizers: 12,
    developers_mentored: 300,
    total_sponsors: 15,
    annual_support: "S/ 20 000",
    sponsored_events: 9,
    developers_reached: 5000,
    active_volunteers: 25,
    volunteer_hours: 1800,
    events_supported: 30,
    volunteer_areas: 6,
    ...over,
  };
}

describe("statsSchema", () => {
  it("acepta el cuerpo que manda el panel", () => {
    expect(statsSchema.safeParse(validStats()).success).toBe(true);
  });

  // El panel reenvía el documento que leyó, `updated_at` incluido. El handler
  // lo sobrescribe, pero rechazarlo rompería el único cliente que existe.
  it("tolera el updated_at que reenvía el panel", () => {
    const parsed = statsSchema.safeParse(
      validStats({ updated_at: "2026-07-30T12:00:00.000Z" })
    );
    expect(parsed.success).toBe(true);
  });

  // Lo que llega aquí acaba publicado en el repo de datos, y el sitio lo valida
  // después, en el build. Una clave inventada tenía que reventar aquí y no en
  // un despliegue.
  it("rechaza campos que no están en la lista", () => {
    const parsed = statsSchema.safeParse(
      validStats({ total_miembros_typo: 5 })
    );
    expect(parsed.success).toBe(false);
  });

  it("rechaza que falte un campo", () => {
    const incompleto = validStats();
    delete (incompleto as Record<string, unknown>).total_members;
    expect(statsSchema.safeParse(incompleto).success).toBe(false);
  });

  it("rechaza un contador que no es número", () => {
    expect(
      statsSchema.safeParse(validStats({ total_events: "48" })).success
    ).toBe(false);
  });

  it("rechaza un contador negativo", () => {
    expect(statsSchema.safeParse(validStats({ total_talks: -1 })).success).toBe(
      false
    );
  });

  it("rechaza un contador con decimales", () => {
    expect(
      statsSchema.safeParse(validStats({ years_active: 7.5 })).success
    ).toBe(false);
  });

  // El motivo del tope. `express.json` deja pasar hasta 1 MB, y un cuerpo así
  // podía superar el límite por documento de Firestore al escribir la fila de
  // auditoría. Como `writeAuditLog` se traga sus errores, el cambio quedaba
  // hecho y sin registrar.
  it("acota el texto libre", () => {
    expect(
      statsSchema.safeParse(validStats({ annual_support: "x".repeat(101) }))
        .success
    ).toBe(false);
  });

  it("acota los contadores por arriba", () => {
    expect(
      statsSchema.safeParse(validStats({ developers_reached: 10_000_001 }))
        .success
    ).toBe(false);
  });
});

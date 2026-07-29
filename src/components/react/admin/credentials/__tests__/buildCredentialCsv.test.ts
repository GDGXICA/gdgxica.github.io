import { describe, expect, it } from "vitest";
import {
  buildCredentialBevyCsv,
  credentialCsvFilename,
} from "../buildCredentialCsv";
import { findDniConflicts, type Credential } from "../types";

function credential(over: Partial<Credential> = {}): Credential {
  return {
    id: "c1",
    dni: "12345678",
    dniNormalized: "12345678",
    firstName: "Alvaro",
    lastName: "Pena",
    email: "alvaro@example.com",
    company: "Shinkansen",
    githubUsername: "aalvaropc",
    heardAbout: "redes_sociales",
    heardAboutOther: "",
    yearsExperience: "3_5",
    googleToolsLevel: "intermedia",
    sequenceNumber: 1,
    groupLetter: "A",
    avatarKind: "mascot",
    mascotId: "gdg-blue-a",
    photoStatus: "none",
    photoPath: null,
    credentialImagePath: null,
    photoUploadedAt: null,
    emailStatus: "sent",
    emailAttempts: 1,
    emailLastError: null,
    emailSentAt: null,
    bevyStatus: "pending",
    bevyTicketNumber: null,
    bevyNote: null,
    bevyLoadedAt: null,
    createdAt: null,
    ...over,
  };
}

function rowsOf(csv: string): string[] {
  return csv.trimEnd().split("\r\n");
}

describe("buildCredentialBevyCsv", () => {
  it("writes a header plus one row per pending credential", () => {
    const r = buildCredentialBevyCsv([
      credential({ id: "a", sequenceNumber: 1 }),
      credential({ id: "b", sequenceNumber: 2, email: "b@example.com" }),
    ]);
    expect(r.rows).toBe(2);
    expect(rowsOf(r.csv)).toHaveLength(3);
  });

  it("excludes anything no longer pending", () => {
    // Re-running after a partial upload must not re-register someone a
    // volunteer already transcribed by hand.
    const r = buildCredentialBevyCsv([
      credential({ id: "a", bevyStatus: "pending" }),
      credential({ id: "b", bevyStatus: "loaded" }),
      credential({ id: "c", bevyStatus: "not_found" }),
      credential({ id: "d", bevyStatus: "discarded" }),
    ]);
    expect(r.rows).toBe(1);
    expect(r.skipped).toBe(3);
  });

  it("emits only a header when nothing is pending", () => {
    const r = buildCredentialBevyCsv([credential({ bevyStatus: "loaded" })]);
    expect(r.rows).toBe(0);
    expect(rowsOf(r.csv)).toHaveLength(1);
  });

  it("orders rows by sequence so the export matches the on-screen queue", () => {
    const r = buildCredentialBevyCsv([
      credential({ id: "c", sequenceNumber: 3, firstName: "Tercero" }),
      credential({ id: "a", sequenceNumber: 1, firstName: "Primero" }),
      credential({ id: "b", sequenceNumber: 2, firstName: "Segundo" }),
    ]);
    const rows = rowsOf(r.csv);
    expect(rows[1].startsWith("Primero")).toBe(true);
    expect(rows[2].startsWith("Segundo")).toBe(true);
    expect(rows[3].startsWith("Tercero")).toBe(true);
  });

  it("quotes a surname containing a comma", () => {
    const r = buildCredentialBevyCsv([
      credential({ lastName: "Quintanilla, Garcia" }),
    ]);
    expect(r.csv).toContain('"Quintanilla, Garcia"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const r = buildCredentialBevyCsv([credential({ company: 'A "B" C' })]);
    expect(r.csv).toContain('"A ""B"" C"');
  });

  it("quotes a value containing a newline", () => {
    const r = buildCredentialBevyCsv([credential({ company: "A\nB" })]);
    expect(r.csv).toContain('"A\nB"');
  });

  it("expands enum answers into the Spanish labels Bevy expects", () => {
    const r = buildCredentialBevyCsv([
      credential({
        heardAbout: "amigo_colega",
        yearsExperience: "menos_1",
        googleToolsLevel: "avanzada",
      }),
    ]);
    expect(r.csv).toContain("Un amigo o colega");
    expect(r.csv).toContain("Menos de 1 año");
    expect(r.csv).toContain("Avanzada");
  });

  it("uses the free-text answer when heardAbout is otro", () => {
    const r = buildCredentialBevyCsv([
      credential({
        heardAbout: "otro",
        heardAboutOther: "Me lo dijo un profe",
      }),
    ]);
    expect(r.csv).toContain("Me lo dijo un profe");
    expect(r.csv).not.toContain("survey:Otro,");
  });

  it("falls back to the raw value for an unmapped enum", () => {
    const r = buildCredentialBevyCsv([
      credential({ yearsExperience: "valor_nuevo" }),
    ]);
    expect(r.csv).toContain("valor_nuevo");
  });

  it("never exports the DNI", () => {
    // Bevy has no such field, and the DNI is the most sensitive value we
    // hold. Spreading it into a third-party upload buys nothing.
    const r = buildCredentialBevyCsv([credential({ dni: "87654321" })]);
    expect(r.csv).not.toContain("87654321");
    expect(r.csv.toLowerCase()).not.toContain("dni");
  });
});

describe("credentialCsvFilename", () => {
  it("stamps local time, not UTC", () => {
    const now = new Date(2026, 10, 21, 9, 5);
    expect(credentialCsvFilename("devfest-2026", now)).toBe(
      "credenciales-devfest-2026-20261121-0905.csv"
    );
  });

  it("zero-pads so names sort chronologically", () => {
    const now = new Date(2026, 0, 5, 8, 7);
    expect(credentialCsvFilename("x", now)).toBe(
      "credenciales-x-20260105-0807.csv"
    );
  });
});

describe("findDniConflicts", () => {
  it("flags every credential sharing a normalized DNI", () => {
    const conflicts = findDniConflicts([
      credential({ id: "a", dniNormalized: "12345678" }),
      credential({ id: "b", dniNormalized: "12345678" }),
      credential({ id: "c", dniNormalized: "87654321" }),
    ]);
    expect(conflicts.has("a")).toBe(true);
    expect(conflicts.has("b")).toBe(true);
    expect(conflicts.has("c")).toBe(false);
  });

  it("returns nothing when every DNI is unique", () => {
    const conflicts = findDniConflicts([
      credential({ id: "a", dniNormalized: "1" }),
      credential({ id: "b", dniNormalized: "2" }),
    ]);
    expect(conflicts.size).toBe(0);
  });

  it("handles an empty list", () => {
    expect(findDniConflicts([]).size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { parseRecipientsCsv } from "../parseRecipientsCsv";

describe("parseRecipientsCsv", () => {
  it("reads names, surnames and email by header", () => {
    const { rows, warnings } = parseRecipientsCsv(
      "Nombres,Apellidos,Correo\nAna María,Torres Ruiz,Ana@Mail.com\n"
    );
    expect(rows).toEqual([
      {
        firstName: "Ana María",
        lastName: "Torres Ruiz",
        email: "ana@mail.com",
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("keeps commas inside quoted cells", () => {
    const { rows } = parseRecipientsCsv(
      'email,firstName,LastName\nana@mail.com,"Ana, la de sistemas",Torres\n'
    );
    expect(rows[0].firstName).toBe("Ana, la de sistemas");
  });

  it("ignores columns that are not names or email (a Bevy export)", () => {
    const csv =
      "Ticket number,First name,Last name,Email,Company,Title\n" +
      't1,Ana,Torres,ana@mail.com,"Acme, Inc.",CTO\n';
    expect(parseRecipientsCsv(csv).rows).toEqual([
      { firstName: "Ana", lastName: "Torres", email: "ana@mail.com" },
    ]);
  });

  it("accepts semicolons and tabs, and a byte-order mark", () => {
    expect(
      parseRecipientsCsv("﻿nombre;apellido;correo\r\nLuis;Paz;luis@x.com").rows
    ).toEqual([{ firstName: "Luis", lastName: "Paz", email: "luis@x.com" }]);
    expect(
      parseRecipientsCsv("correo\tnombre completo\nluis@x.com\tLuis Paz").rows
    ).toEqual([{ firstName: "Luis Paz", lastName: "", email: "luis@x.com" }]);
  });

  it("works without a header by finding the email cell", () => {
    const { rows } = parseRecipientsCsv(
      "ana@mail.com,Ana,Torres,extra\nLuis,Paz,luis@x.com\n"
    );
    expect(rows).toEqual([
      { firstName: "Ana", lastName: "Torres", email: "ana@mail.com" },
      { firstName: "Luis", lastName: "Paz", email: "luis@x.com" },
    ]);
  });

  it("names the lines it skipped and why", () => {
    const { rows, warnings } = parseRecipientsCsv(
      "nombre,apellido,correo\nAna,Torres,josé@mail.com\n,,luis@x.com\nLuis,Paz,\nEva,Ríos,eva@x.com\nEva,Ríos,EVA@x.com\n"
    );
    expect(rows).toHaveLength(1);
    expect(warnings).toEqual([
      "Se omitieron 2 filas por el correo, en la línea 2 (josé@mail.com), 4 (sin correo).",
      "Se omitió 1 fila sin nombre, en la línea 3.",
      "1 fila repetida se omitió.",
    ]);
  });

  it("explains a file without any email", () => {
    expect(
      parseRecipientsCsv("nombre,apellido\nAna,Torres").warnings[0]
    ).toMatch(/columna de correo/);
    expect(parseRecipientsCsv("  \n").warnings).toEqual([
      "El archivo está vacío.",
    ]);
  });
});

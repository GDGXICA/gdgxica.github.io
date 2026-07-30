import { describe, expect, it } from "vitest";
import { formSchema, formUpdateSchema } from "./index";

/**
 * `POST /api/forms` y `PUT /api/forms/:id` eran las últimas escrituras de la
 * API sin esquema. Los handlers hacían `req.body as FormEntry` y
 * `req.body as Partial<FormEntry>`, y `updateForm` mezclaba ese cuerpo sin
 * validar sobre la entrada existente, así que cualquier clave inventada
 * acababa publicada en `about/forms.json` del repo de datos.
 */

/** Cuerpo válido: lo que manda el panel al crear. */
function validForm(over: Record<string, unknown> = {}) {
  return {
    id: "speakers-bwai-2026",
    name: "Postulación de speakers BWAI 2026",
    spreadsheet_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    sheet_name: "Form Responses 1",
    is_public: true,
    created_at: "",
    ...over,
  };
}

describe("formSchema", () => {
  it("acepta el cuerpo que manda el panel", () => {
    expect(formSchema.safeParse(validForm()).success).toBe(true);
  });

  // El panel arrastra `created_at: ""` desde EMPTY_FORM hasta el cuerpo del
  // POST — nunca se edita en la UI y el handler lo pisa con la hora del
  // servidor. Rechazarlo rompería el alta de formularios, que es el único
  // cliente que existe.
  it("tolera el created_at vacío que arrastra el panel", () => {
    expect(formSchema.safeParse(validForm({ created_at: "" })).success).toBe(
      true
    );
  });

  it("acepta que falte created_at", () => {
    const sinFecha = validForm();
    delete (sinFecha as Record<string, unknown>).created_at;
    expect(formSchema.safeParse(sinFecha).success).toBe(true);
  });

  it("aplica los valores por defecto de sheet_name e is_public", () => {
    const minimo = validForm();
    delete (minimo as Record<string, unknown>).sheet_name;
    delete (minimo as Record<string, unknown>).is_public;

    const parsed = formSchema.safeParse(minimo);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sheet_name).toBe("Form Responses 1");
      expect(parsed.data.is_public).toBe(true);
    }
  });

  // Lo que llega aquí acaba en el repo de datos público. Una clave inventada
  // tenía que reventar aquí y no después, en el build del sitio.
  it("rechaza campos que no están en la lista", () => {
    expect(
      formSchema.safeParse(validForm({ is_publico_typo: true })).success
    ).toBe(false);
  });

  it("rechaza que falten los campos obligatorios", () => {
    for (const campo of ["id", "name", "spreadsheet_id"]) {
      const incompleto = validForm();
      delete (incompleto as Record<string, unknown>)[campo];
      expect(formSchema.safeParse(incompleto).success).toBe(false);
    }
  });

  it("rechaza un nombre vacío", () => {
    expect(formSchema.safeParse(validForm({ name: "" })).success).toBe(false);
  });

  // El id se concatena para buscar la entrada y viaja al mensaje de commit;
  // el spreadsheet_id acaba en la llamada a la API de Sheets. Los dos se
  // acotan al mismo patrón que el resto de identificadores de la API.
  it("rechaza un id fuera del patrón seguro", () => {
    for (const malo of ["../../etc/passwd", "con espacios", "punto.punto"]) {
      expect(formSchema.safeParse(validForm({ id: malo })).success).toBe(false);
    }
  });

  it("rechaza un spreadsheet_id fuera del patrón seguro", () => {
    expect(
      formSchema.safeParse(validForm({ spreadsheet_id: "a/b?range=Z" })).success
    ).toBe(false);
  });

  it("rechaza un is_public que no es booleano", () => {
    expect(formSchema.safeParse(validForm({ is_public: "true" })).success).toBe(
      false
    );
  });

  it("acota el texto libre", () => {
    expect(
      formSchema.safeParse(validForm({ name: "x".repeat(201) })).success
    ).toBe(false);
    expect(
      formSchema.safeParse(validForm({ sheet_name: "x".repeat(201) })).success
    ).toBe(false);
  });
});

describe("formUpdateSchema", () => {
  it("acepta una actualización parcial", () => {
    expect(formUpdateSchema.safeParse({ is_public: false }).success).toBe(true);
  });

  it("acepta el objeto completo tal como lo devolvería el listado", () => {
    expect(
      formUpdateSchema.safeParse(
        validForm({ created_at: "2026-07-30T12:00:00.000Z" })
      ).success
    ).toBe(true);
  });

  // `.partial()` tiene que conservar la política de claves desconocidas: si no,
  // el PUT seguiría siendo la puerta abierta que este esquema viene a cerrar.
  it("sigue rechazando campos fuera de la lista", () => {
    expect(formUpdateSchema.safeParse({ is_publico_typo: true }).success).toBe(
      false
    );
  });

  it("sigue validando el formato de los campos que sí llegan", () => {
    expect(formUpdateSchema.safeParse({ id: "../otro" }).success).toBe(false);
    expect(formUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

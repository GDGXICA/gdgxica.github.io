import { describe, expect, it } from "vitest";
import {
  draftIssues,
  extractSpreadsheetId,
  responsesErrorMessage,
} from "../copy";

describe("extractSpreadsheetId", () => {
  it("keeps only the id from a pasted sheet link", () => {
    expect(
      extractSpreadsheetId(
        "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMd_x-9/edit#gid=0"
      )
    ).toBe("1BxiMVs0XRA5nFMd_x-9");
  });

  it("leaves a bare id untouched", () => {
    expect(extractSpreadsheetId("1BxiMVs0XRA5nFMd")).toBe("1BxiMVs0XRA5nFMd");
  });
});

describe("draftIssues", () => {
  const complete = {
    id: "speakers-2026",
    name: "Convocatoria",
    spreadsheet_id: "1Bxi",
  };

  it("lists what is missing in reading order", () => {
    expect(
      draftIssues({ id: "", name: " ", spreadsheet_id: "" }, []).missing
    ).toEqual(["ID", "nombre", "ID de la hoja de cálculo"]);
  });

  it("accepts a complete draft", () => {
    expect(draftIssues(complete, ["otro"])).toEqual({
      missing: [],
      idError: undefined,
      spreadsheetError: undefined,
    });
  });

  it("rejects ids the server would refuse", () => {
    expect(
      draftIssues({ ...complete, id: "con espacios" }, []).idError
    ).toMatch(/sin espacios/);
  });

  it("flags an id that is already registered", () => {
    expect(draftIssues(complete, ["speakers-2026"]).idError).toMatch(
      /Ya hay un formulario/
    );
  });

  it("flags a spreadsheet value that is not an id", () => {
    expect(
      draftIssues({ ...complete, spreadsheet_id: "no es un id" }, [])
        .spreadsheetError
    ).toMatch(/Pega solo el ID/);
  });
});

describe("responsesErrorMessage", () => {
  it("explains the known server errors in Spanish", () => {
    expect(responsesErrorMessage("Form not found")).toMatch(
      /ya no está registrado/
    );
    expect(responsesErrorMessage("This form is private")).toMatch(/privado/);
  });

  it("falls back to the likely cause", () => {
    expect(responsesErrorMessage("An internal error occurred")).toMatch(
      /no está compartida/
    );
  });
});

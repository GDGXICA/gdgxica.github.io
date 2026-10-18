export const SHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

export function extractSpreadsheetId(value: string): string {
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

export interface FormDraft {
  id: string;
  name: string;
  spreadsheet_id: string;
}

export interface DraftIssues {
  missing: string[];
  idError?: string;
  spreadsheetError?: string;
}

export function draftIssues(
  draft: FormDraft,
  existingIds: string[]
): DraftIssues {
  const id = draft.id.trim();
  const spreadsheet = draft.spreadsheet_id.trim();
  const missing = [
    !id && "ID",
    !draft.name.trim() && "nombre",
    !spreadsheet && "ID de la hoja de cálculo",
  ].filter(Boolean) as string[];

  let idError: string | undefined;
  if (id && !SHEET_ID_PATTERN.test(draft.id)) {
    idError =
      "Usa solo letras, números, guiones y guiones bajos, sin espacios.";
  } else if (id && existingIds.includes(id)) {
    idError = "Ya hay un formulario registrado con este ID. Elige otro.";
  }

  const spreadsheetError =
    spreadsheet && !SHEET_ID_PATTERN.test(spreadsheet)
      ? "Pega solo el ID: el tramo entre /d/ y /edit en el enlace de la hoja."
      : undefined;

  return { missing, idError, spreadsheetError };
}

export function responsesErrorMessage(error?: string): string {
  if (error === "Form not found") {
    return "Este formulario ya no está registrado. Vuelve a Formularios y elige otro.";
  }
  if (error === "This form is private") {
    return "Este formulario es privado: sus respuestas no se pueden abrir desde el panel.";
  }
  return "No se pudieron cargar las respuestas. Suele pasar cuando la hoja no está compartida con la cuenta del panel o cambió de nombre.";
}

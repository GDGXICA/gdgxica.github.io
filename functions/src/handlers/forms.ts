import { Request, Response } from "express";
import { z } from "zod";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { GitHubService } from "../services/github";
import { readSheet } from "../services/sheets";
import { safeError } from "../middleware/validate";
import { formSchema, formUpdateSchema } from "../schemas";
import { GITHUB_TOKEN } from "../config";

interface FormEntry {
  id: string;
  name: string;
  spreadsheet_id: string;
  sheet_name: string;
  is_public: boolean;
  created_at: string;
}

// Lo que el middleware deja en `req.body`: validado, con defaults aplicados.
type FormBody = z.infer<typeof formSchema>;
type FormUpdateBody = z.infer<typeof formUpdateSchema>;

export async function listForms(req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } =
      await github.getFileContent<FormEntry[]>("about/forms.json");

    const user = (req as AuthenticatedRequest).user;
    // Quien puede gestionar formularios ve también los no públicos; el resto
    // se queda con los públicos. Antes esto miraba el rol directamente, lo
    // que dejaba fuera la posibilidad de concederlo por permiso.
    const canSeeAll = user.permissions.has("forms:write");

    const visible = canSeeAll ? data : data.filter((f) => f.is_public);
    res.json({ success: true, data: visible });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function addForm(req: Request, res: Response) {
  try {
    // `validateBody(formSchema)` ya rechazó lo que falte o sobre y aplicó los
    // valores por defecto de `sheet_name` e `is_public`, así que aquí no queda
    // nada que comprobar a mano.
    const form = req.body as FormBody;

    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const entry: FormEntry = {
      id: form.id,
      name: form.name,
      spreadsheet_id: form.spreadsheet_id,
      sheet_name: form.sheet_name,
      is_public: form.is_public,
      // El panel envía `created_at: ""`; la hora la pone el servidor.
      created_at: new Date().toISOString(),
    };

    const { data: forms, sha } =
      await github.getFileContent<FormEntry[]>("about/forms.json");
    forms.push(entry);

    await github.putFile(
      "about/forms.json",
      JSON.stringify(forms, null, 2),
      `feat(forms): add ${entry.name}`,
      sha
    );

    await writeAuditLog(
      {
        action: "form.create",
        performedBy: user.uid,
        targetId: entry.id,
        targetType: "form",
        details: { name: entry.name },
      },
      req
    );

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateForm(req: Request, res: Response) {
  try {
    const formId = req.params.id as string;
    const updates = req.body as FormUpdateBody;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: forms, sha } =
      await github.getFileContent<FormEntry[]>("about/forms.json");
    const index = forms.findIndex((f) => f.id === formId);

    if (index === -1) {
      res.status(404).json({ success: false, error: "Form not found" });
      return;
    }

    forms[index] = { ...forms[index], ...updates, id: formId };

    await github.putFile(
      "about/forms.json",
      JSON.stringify(forms, null, 2),
      `fix(forms): update ${formId}`,
      sha
    );

    await writeAuditLog(
      {
        action: "form.update",
        performedBy: user.uid,
        targetId: formId,
        targetType: "form",
        details: { name: forms[index].name },
      },
      req
    );

    res.json({ success: true, data: forms[index] });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function deleteForm(req: Request, res: Response) {
  try {
    const formId = req.params.id as string;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: forms, sha } =
      await github.getFileContent<FormEntry[]>("about/forms.json");
    const filtered = forms.filter((f) => f.id !== formId);

    if (filtered.length === forms.length) {
      res.status(404).json({ success: false, error: "Form not found" });
      return;
    }

    await github.putFile(
      "about/forms.json",
      JSON.stringify(filtered, null, 2),
      `chore(forms): remove ${formId}`,
      sha
    );

    await writeAuditLog(
      {
        action: "form.delete",
        performedBy: user.uid,
        targetId: formId,
        targetType: "form",
        details: {},
      },
      req
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function getFormResponses(req: Request, res: Response) {
  try {
    const formId = req.params.id as string;
    const github = new GitHubService(GITHUB_TOKEN.value());

    const { data: forms } =
      await github.getFileContent<FormEntry[]>("about/forms.json");
    const form = forms.find((f) => f.id === formId);

    if (!form) {
      res.status(404).json({ success: false, error: "Form not found" });
      return;
    }

    if (!form.is_public) {
      res.status(403).json({ success: false, error: "This form is private" });
      return;
    }

    const data = await readSheet(form.spreadsheet_id, form.sheet_name);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

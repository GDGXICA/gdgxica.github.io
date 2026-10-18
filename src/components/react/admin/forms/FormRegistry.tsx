import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import {
  ArrowIcon,
  CornerNodes,
  ErrorState,
  HeaderActions,
  LoadingState,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { draftIssues, extractSpreadsheetId } from "./copy";

interface FormEntry {
  id: string;
  name: string;
  spreadsheet_id: string;
  sheet_name: string;
  is_public: boolean;
  created_at: string;
}

const EMPTY_FORM: FormEntry = {
  id: "",
  name: "",
  spreadsheet_id: "",
  sheet_name: "Form Responses 1",
  is_public: true,
  created_at: "",
};

const SERVICE_ACCOUNT = "647264238138-compute@developer.gserviceaccount.com";

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function FormRow({
  form,
  canManage,
  deleting,
  onDelete,
}: {
  form: FormEntry;
  canManage: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const created = formatDate(form.created_at);

  return (
    <li className="border-atlas-line grid gap-x-5 gap-y-4 border-b py-5 last:border-b-0 @3xl:grid-cols-[1fr_auto] @3xl:items-center">
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {form.name || form.id}
        </p>
        <p className="text-atlas-mist mt-1 text-sm">
          <span className={form.is_public ? "text-atlas-dust" : ""}>
            {form.is_public ? "Público" : "Privado"}
          </span>
          {created && <> · Registrado el {created}</>}
          {form.sheet_name && <> · Hoja «{form.sheet_name}»</>}
        </p>
        <p className="text-atlas-fog mt-0.5 text-xs">{form.id}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 @3xl:justify-end">
        {form.is_public ? (
          <a
            href={`/admin/forms/viewer?id=${encodeURIComponent(form.id)}`}
            className={buttonClass.secondary}
          >
            Ver respuestas
          </a>
        ) : (
          <span className="text-atlas-fog px-2 py-1.5 text-sm">
            Respuestas cerradas al panel
          </span>
        )}
        {canManage && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        )}
      </div>
    </li>
  );
}

export function FormRegistry() {
  const { can } = useAuth();
  const canManageForms = can("forms:write");
  const [forms, setForms] = useState<FormEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormEntry>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadForms();
  }, []);

  async function loadForms() {
    setLoading(true);
    setError(false);
    const res = await api.listForms();
    if (res.success && res.data) {
      setForms(res.data as FormEntry[]);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  const issues = draftIssues(
    form,
    forms.map((f) => f.id)
  );
  const ready =
    issues.missing.length === 0 && !issues.idError && !issues.spreadsheetError;

  function closeForm() {
    setCreating(false);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) {
      setToast({
        message: "Completa el ID, el nombre y el ID de la hoja de cálculo.",
        type: "error",
      });
      return;
    }
    setSaving(true);
    const res = await api.addForm(form);
    if (res.success) {
      setToast({
        message: `Formulario «${form.name.trim()}» registrado`,
        type: "success",
      });
      closeForm();
      loadForms();
    } else {
      setToast({
        message:
          "No se pudo registrar el formulario. Revisa los datos e inténtalo de nuevo.",
        type: "error",
      });
    }
    setSaving(false);
  }

  async function handleDelete(entry: FormEntry) {
    const label = entry.name || entry.id;
    if (
      !confirm(
        `¿Eliminar el formulario «${label}»? Dejará de aparecer en el panel; la hoja de cálculo y sus respuestas no se tocan.`
      )
    )
      return;
    setDeleting(entry.id);
    const res = await api.deleteForm(entry.id);
    if (res.success) {
      setForms((prev) => prev.filter((f) => f.id !== entry.id));
      setToast({ message: `Formulario «${label}» eliminado`, type: "success" });
    } else {
      setToast({
        message: "No se pudo eliminar el formulario. Inténtalo de nuevo.",
        type: "error",
      });
    }
    setDeleting(null);
  }

  const toastNode = toast && (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );

  if (creating) {
    return (
      <div className="mx-auto max-w-6xl">
        {toastNode}
        <button
          type="button"
          onClick={closeForm}
          className={`${buttonClass.quiet} mb-6 -ml-2`}
        >
          <ArrowIcon className="size-4 rotate-180" />
          Volver a formularios
        </button>

        <form
          onSubmit={handleSave}
          noValidate
          className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div className="space-y-10">
            <section aria-labelledby="form-datos">
              <SectionHeading>
                <span id="form-datos">1 · Formulario</span>
              </SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FormField label="ID" required error={issues.idError}>
                    <input
                      type="text"
                      value={form.id}
                      onChange={(e) => setForm({ ...form, id: e.target.value })}
                      placeholder="speakers-bwai-2026"
                      autoComplete="off"
                      spellCheck={false}
                      className={inputClass}
                    />
                  </FormField>
                  {!issues.idError && (
                    <p className="text-atlas-fog mt-1.5 text-xs">
                      Identifica el formulario en el panel. No se puede cambiar
                      después.
                    </p>
                  )}
                </div>
                <FormField label="Nombre" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Convocatoria de speakers"
                    className={inputClass}
                  />
                </FormField>
              </div>
            </section>

            <section aria-labelledby="form-hoja">
              <SectionHeading>
                <span id="form-hoja">2 · Hoja de respuestas</span>
              </SectionHeading>
              <p className="text-atlas-mist mb-4 max-w-[70ch] text-sm leading-relaxed">
                El panel lee las respuestas desde la hoja de cálculo vinculada
                al formulario de Google. Puedes pegar el enlace completo de la
                hoja: se queda solo con el ID.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="ID de la hoja de cálculo"
                  required
                  error={issues.spreadsheetError}
                >
                  <input
                    type="text"
                    value={form.spreadsheet_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        spreadsheet_id: extractSpreadsheetId(
                          e.target.value.trim()
                        ),
                      })
                    }
                    placeholder="1BxiMVs0XRA5nFMd…"
                    autoComplete="off"
                    spellCheck={false}
                    className={inputClass}
                  />
                </FormField>
                <div>
                  <FormField label="Nombre de la pestaña">
                    <input
                      type="text"
                      value={form.sheet_name}
                      onChange={(e) =>
                        setForm({ ...form, sheet_name: e.target.value })
                      }
                      className={inputClass}
                    />
                  </FormField>
                  <p className="text-atlas-fog mt-1.5 text-xs">
                    Google la llama «Form Responses 1» o «Respuestas de
                    formulario 1».
                  </p>
                </div>
              </div>
              <div className="border-atlas-line mt-6 rounded-xs border px-5 py-4 text-sm">
                <p className="atlas-label text-atlas-glow">
                  Antes de registrar
                </p>
                <p className="text-atlas-mist mt-2 leading-relaxed">
                  Comparte la hoja como{" "}
                  <span className="text-atlas-dust">Lector</span> con la cuenta
                  del panel; si no, las respuestas no cargarán.
                </p>
                <code className="text-atlas-dust bg-atlas-deep mt-2 inline-block rounded-xs px-2 py-1 text-xs break-all select-all">
                  {SERVICE_ACCOUNT}
                </code>
              </div>
            </section>

            <section aria-labelledby="form-visibilidad">
              <SectionHeading>
                <span id="form-visibilidad">3 · Visibilidad</span>
              </SectionHeading>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(e) =>
                    setForm({ ...form, is_public: e.target.checked })
                  }
                  className="accent-atlas-ember mt-0.5 size-4 shrink-0"
                />
                <span>
                  <span className="text-atlas-dust font-semibold">Público</span>
                  <span className="text-atlas-mist mt-1 block leading-relaxed">
                    Quien tenga acceso a Formularios lo verá en la lista y podrá
                    abrir sus respuestas. Si lo desmarcas, solo lo verá quien
                    gestiona formularios y sus respuestas no se podrán abrir
                    desde el panel.
                  </span>
                </span>
              </label>
            </section>
          </div>

          <aside
            aria-label="Resumen del registro"
            className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
          >
            <CornerNodes />
            <p className="atlas-label text-atlas-glow">Resumen</p>
            <p className="atlas-name text-atlas-dust mt-3 text-lg leading-snug break-words">
              {form.name.trim() || "Sin nombre todavía"}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">ID</dt>
                <dd className="text-atlas-dust min-w-0 truncate text-right">
                  {form.id.trim() || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Pestaña</dt>
                <dd className="text-atlas-dust min-w-0 truncate text-right">
                  {form.sheet_name.trim() || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Visibilidad</dt>
                <dd className="text-atlas-dust text-right">
                  {form.is_public ? "Público" : "Privado"}
                </dd>
              </div>
            </dl>

            {!ready && (
              <p className="text-atlas-mist mt-4 text-sm">
                {issues.missing.length > 0
                  ? `Falta: ${issues.missing.join(", ")}.`
                  : "Corrige los campos marcados."}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !ready}
              className={`${buttonClass.primary} mt-5 w-full`}
            >
              {saving ? "Registrando…" : "Registrar formulario"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className={`${buttonClass.quiet} mt-2 w-full justify-center`}
            >
              Cancelar
            </button>
          </aside>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {canManageForms && (
        <HeaderActions>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={buttonClass.primary}
          >
            Registrar formulario
          </button>
        </HeaderActions>
      )}

      {toastNode}

      <p className="text-atlas-mist mb-8 max-w-[70ch] text-sm leading-relaxed">
        Formularios de Google cuyas respuestas se consultan aquí, leídas
        directamente de su hoja de cálculo.
      </p>

      {loading ? (
        <LoadingState label="Cargando formularios…" />
      ) : error ? (
        <ErrorState
          message="No se pudieron cargar los formularios. Suele ser la conexión con el repositorio de datos."
          onRetry={loadForms}
        />
      ) : forms.length === 0 ? (
        <div className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          Todavía no hay formularios registrados.
          {canManageForms && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-atlas-dust font-semibold underline underline-offset-4"
              >
                Registra el primero
              </button>
              .
            </>
          )}
        </div>
      ) : (
        <section
          aria-labelledby="formularios-registrados"
          className="@container"
        >
          <SectionHeading
            action={
              <span className="text-atlas-fog text-sm tabular-nums">
                {forms.length}{" "}
                {forms.length === 1 ? "formulario" : "formularios"}
              </span>
            }
          >
            <span id="formularios-registrados">Registrados</span>
          </SectionHeading>
          <ul>
            {forms.map((f) => (
              <FormRow
                key={f.id}
                form={f}
                canManage={canManageForms}
                deleting={deleting === f.id}
                onDelete={() => handleDelete(f)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

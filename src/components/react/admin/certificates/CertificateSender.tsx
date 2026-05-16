import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";

interface Recipient {
  name: string;
  email: string;
}

interface SendResult {
  email: string;
  name: string;
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_META = {
  eventName: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  hours: "",
  organizer: "GDG ICA",
};

// Splits a CSV/TSV blob into {name,email} rows. Accepts comma, semicolon
// or tab separators, skips a header row if the first line looks like
// one, and tolerates "email,name" or "name,email" column order.
function parseCsv(text: string): Recipient[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const split = (line: string) => line.split(/[,;\t]/).map((c) => c.trim());
  const first = split(lines[0]).join(" ").toLowerCase();
  const hasHeader =
    first.includes("email") ||
    first.includes("correo") ||
    first.includes("nombre");
  const body = hasHeader ? lines.slice(1) : lines;

  const out: Recipient[] = [];
  for (const line of body) {
    const cols = split(line);
    if (cols.length < 2) continue;
    const emailCol = cols.find((c) => EMAIL_RE.test(c));
    const email = emailCol ?? cols[1];
    const name = cols.find((c) => c !== email) ?? cols[0];
    if (name && email) out.push({ name, email });
  }
  return out;
}

export function CertificateSender() {
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [manual, setManual] = useState<Recipient>({ name: "", email: "" });
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidCount = useMemo(
    () => recipients.filter((r) => !EMAIL_RE.test(r.email)).length,
    [recipients]
  );

  function setMetaField(k: keyof typeof EMPTY_META, v: string) {
    setMeta((m) => ({ ...m, [k]: v }));
  }

  function dedupeAppend(incoming: Recipient[]) {
    setRecipients((prev) => {
      const seen = new Set(prev.map((r) => r.email.toLowerCase()));
      const merged = [...prev];
      for (const r of incoming) {
        const key = r.email.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(r);
        }
      }
      return merged;
    });
  }

  function addManual() {
    const name = manual.name.trim();
    const email = manual.email.trim();
    if (!name || !email) {
      setToast({ message: "Nombre y correo requeridos", type: "error" });
      return;
    }
    dedupeAppend([{ name, email }]);
    setManual({ name: "", email: "" });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setToast({ message: "No se encontraron filas válidas", type: "error" });
    } else {
      dedupeAppend(parsed);
      setToast({
        message: `${parsed.length} destinatario(s) importado(s)`,
        type: "success",
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r.email !== email));
  }

  function metaComplete() {
    return (
      meta.eventName.trim() &&
      meta.eventDate &&
      meta.startTime.trim() &&
      meta.endTime.trim() &&
      Number(meta.hours) > 0
    );
  }

  async function handleSend() {
    if (!metaComplete()) {
      setToast({
        message:
          "Completa los datos del evento (nombre, fecha, horario, horas)",
        type: "error",
      });
      return;
    }
    if (recipients.length === 0) {
      setToast({ message: "Agrega al menos un destinatario", type: "error" });
      return;
    }
    if (invalidCount > 0) {
      setToast({
        message: `${invalidCount} correo(s) con formato inválido — corrígelos o elimínalos`,
        type: "error",
      });
      return;
    }
    if (
      !window.confirm(
        `Se generarán y enviarán ${recipients.length} certificado(s) por correo. ` +
          `Esta acción no se puede deshacer. ¿Continuar?`
      )
    ) {
      return;
    }

    setSending(true);
    setResults(null);
    const res = await api.sendCertificates({
      eventName: meta.eventName.trim(),
      startTime: meta.startTime.trim(),
      endTime: meta.endTime.trim(),
      hours: Number(meta.hours),
      eventDate: meta.eventDate,
      organizer: meta.organizer.trim() || undefined,
      recipients: recipients.map((r) => ({
        name: r.name.trim(),
        email: r.email.trim(),
      })),
    });
    setSending(false);

    if (res.success && res.data) {
      setResults(res.data.results);
      setToast({
        message: `Enviados: ${res.data.sent} · Fallidos: ${res.data.failed}`,
        type: res.data.failed > 0 ? "error" : "success",
      });
    } else {
      setToast({
        message: res.error || "Error al enviar certificados",
        type: "error",
      });
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white";

  return (
    <div className="mx-auto max-w-4xl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Certificados
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Genera y envía certificados de participación por correo. Los PDF se
          crean al momento y no se almacenan.
        </p>
      </header>

      <section className="mb-6 rounded-xl bg-white p-5 shadow dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Datos del evento
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Nombre del evento" required>
              <input
                className={inputCls}
                value={meta.eventName}
                onChange={(e) => setMetaField("eventName", e.target.value)}
                placeholder="Taller intensivo: prepárate para certificarte en Cloud"
              />
            </FormField>
          </div>
          <FormField label="Fecha del evento" required>
            <input
              type="date"
              className={inputCls}
              value={meta.eventDate}
              onChange={(e) => setMetaField("eventDate", e.target.value)}
            />
          </FormField>
          <FormField label="Horas" required>
            <input
              type="number"
              min="0"
              step="0.5"
              className={inputCls}
              value={meta.hours}
              onChange={(e) => setMetaField("hours", e.target.value)}
              placeholder="4"
            />
          </FormField>
          <FormField label="Hora de inicio" required>
            <input
              className={inputCls}
              value={meta.startTime}
              onChange={(e) => setMetaField("startTime", e.target.value)}
              placeholder="9:00 am"
            />
          </FormField>
          <FormField label="Hora de fin" required>
            <input
              className={inputCls}
              value={meta.endTime}
              onChange={(e) => setMetaField("endTime", e.target.value)}
              placeholder="1:00 pm"
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Organizador">
              <input
                className={inputCls}
                value={meta.organizer}
                onChange={(e) => setMetaField("organizer", e.target.value)}
                placeholder="GDG ICA"
              />
            </FormField>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-xl bg-white p-5 shadow dark:bg-gray-800">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          Destinatarios
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Importa un CSV (columnas nombre y correo) o agrégalos uno por uno.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Importar CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleFile}
            />
          </label>
          {recipients.length > 0 && (
            <button
              type="button"
              onClick={() => setRecipients([])}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Vaciar lista
            </button>
          )}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className={inputCls}
            value={manual.name}
            onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
            placeholder="Nombre completo"
          />
          <input
            className={inputCls}
            value={manual.email}
            onChange={(e) =>
              setManual((m) => ({ ...m, email: e.target.value }))
            }
            placeholder="correo@ejemplo.com"
            onKeyDown={(e) => e.key === "Enter" && addManual()}
          />
          <button
            type="button"
            onClick={addManual}
            className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            Agregar
          </button>
        </div>

        {recipients.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
              <span>
                {recipients.length} destinatario(s)
                {invalidCount > 0 && (
                  <span className="ml-2 text-red-600 dark:text-red-400">
                    · {invalidCount} con correo inválido
                  </span>
                )}
              </span>
            </div>
            <ul className="max-h-72 divide-y divide-gray-100 overflow-auto dark:divide-gray-700">
              {recipients.map((r) => {
                const bad = !EMAIL_RE.test(r.email);
                return (
                  <li
                    key={r.email}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="text-gray-900 dark:text-white">
                        {r.name}
                      </span>
                      <span
                        className={`ml-2 ${
                          bad
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {r.email}
                        {bad && " ⚠"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRecipient(r.email)}
                      className="ml-3 shrink-0 text-gray-400 hover:text-red-600"
                      aria-label={`Eliminar ${r.email}`}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400 dark:border-gray-600">
            Sin destinatarios todavía
          </p>
        )}
      </section>

      <div className="mb-8 flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={handleSend}
          className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Enviando…" : `Generar y enviar (${recipients.length})`}
        </button>
      </div>

      {results && (
        <section className="mb-8 rounded-xl bg-white p-5 shadow dark:bg-gray-800">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Resultado del envío
          </h2>
          <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-700">
            {results.map((r) => (
              <li
                key={r.email}
                className="flex items-center justify-between py-2"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {r.name} · {r.email}
                </span>
                <span
                  className={
                    r.ok
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {r.ok ? "✓ Enviado" : `✕ ${r.error || "Falló"}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

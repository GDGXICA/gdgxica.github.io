import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import { EMAIL_RE, parseCsv, type Recipient } from "./parseCsv";

interface SendResult {
  email: string;
  name: string;
  ok: boolean;
  error?: string;
}

interface EventSummary {
  id: string;
  title: string;
}

interface EventDetail {
  title: string;
  date: string;
  end_time: string;
}

const EMPTY_META = {
  eventName: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  hours: "",
  organizer: "GDG ICA",
};

type Time = { h: number; m: number };

// Parsea "02:00 PM", "5:00 p.m.", "17:00" → { h: 0-23, m: 0-59 }
function parse12h(raw: string): Time | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/);
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  const period = match[3]?.replace(/[.\s]/g, ""); // "am" | "pm" | undefined
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  return { h, m };
}

// { h: 8, m: 0 } → "8:00 a.m."
function formatTime12h({ h, m }: Time): string {
  const period = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

// Horas decimales entre dos tiempos (maneja cruce de medianoche)
function computeHours(start: Time, end: Time): number {
  let mins = end.h * 60 + end.m - (start.h * 60 + start.m);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

export function CertificateSender() {
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [manual, setManual] = useState<Recipient>({ name: "", email: "" });
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cuando no hay evento seleccionado, los campos manuales están siempre
  // visibles (flujo manual); con evento seleccionado se ocultan salvo override.
  const showManualFields = !selectedEventId || manualOpen;

  useEffect(() => {
    (async () => {
      const res = await api.listEvents();
      if (res.success && res.data) {
        setEvents(res.data as EventSummary[]);
      } else {
        setToast({
          message: res.error || "No se pudieron cargar los eventos",
          type: "error",
        });
      }
    })();
  }, []);

  const invalidCount = useMemo(
    () => recipients.filter((r) => !EMAIL_RE.test(r.email)).length,
    [recipients]
  );

  function setMetaField(k: keyof typeof EMPTY_META, v: string) {
    setMeta((m) => ({ ...m, [k]: v }));
  }

  async function handleSelectEvent(id: string) {
    setSelectedEventId(id);
    if (!id) {
      setMeta({ ...EMPTY_META });
      setManualOpen(false);
      return;
    }
    setLoadingEvent(true);
    const res = await api.getEvent(id);
    setLoadingEvent(false);
    if (!res.success || !res.data) {
      setToast({
        message: res.error || "No se pudo cargar el evento",
        type: "error",
      });
      return;
    }
    const ev = res.data as EventDetail;
    const [datePart, timePart] = (ev.date || "").split("T");
    let start: Time | null = null;
    if (timePart) {
      const [sh, sm] = timePart.split(":").map(Number);
      if (!Number.isNaN(sh) && !Number.isNaN(sm)) start = { h: sh, m: sm };
    }
    const end = parse12h(ev.end_time || "");
    const startTime = start ? formatTime12h(start) : "";
    const endTime = (ev.end_time || "").trim();
    const hours = start && end ? computeHours(start, end) : 0;

    setMeta({
      eventName: (ev.title || "").trim(),
      eventDate: datePart || "",
      startTime,
      endTime,
      hours: hours > 0 ? String(hours) : "",
      organizer: "GDG ICA",
    });
    setManualOpen(false);

    const missing: string[] = [];
    if (!startTime) missing.push("hora de inicio");
    if (!endTime) missing.push("hora de fin");
    if (hours <= 0) missing.push("horas");
    if (missing.length > 0) {
      setManualOpen(true);
      setToast({
        message: `Evento cargado. Completa manualmente: ${missing.join(", ")}`,
        type: "error",
      });
    } else {
      setToast({ message: "Datos del evento cargados", type: "success" });
    }
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
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          Evento
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Selecciona un evento para autocompletar los datos. El organizador es
          siempre GDG ICA.
        </p>

        <FormField label="Seleccionar evento">
          <select
            className={inputCls}
            value={selectedEventId}
            disabled={loadingEvent}
            onChange={(e) => handleSelectEvent(e.target.value)}
          >
            <option value="">— Ingresar manualmente —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </FormField>
        {loadingEvent && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Cargando datos del evento…
          </p>
        )}

        {selectedEventId && !manualOpen && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-700/40">
            <p className="font-medium text-gray-900 dark:text-white">
              {meta.eventName || "—"}
            </p>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              {[
                meta.eventDate,
                meta.startTime && meta.endTime
                  ? `${meta.startTime} – ${meta.endTime}`
                  : "",
                meta.hours ? `${meta.hours} h` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Organizador: {meta.organizer}
            </p>
          </div>
        )}

        {selectedEventId && (
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {manualOpen ? "▾" : "▸"} Ajustar datos manualmente
          </button>
        )}

        <div className={showManualFields ? "mt-4" : "hidden"}>
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

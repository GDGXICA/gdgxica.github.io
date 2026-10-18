import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import {
  ArrowIcon,
  CloseIcon,
  CornerNodes,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";
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

  const inputCls = inputClass;
  const missing = [
    !meta.eventName.trim() && "nombre del evento",
    !meta.eventDate && "fecha",
    (!meta.startTime.trim() || !meta.endTime.trim()) && "horario",
    !(Number(meta.hours) > 0) && "horas",
    recipients.length === 0 && "destinatarios",
  ].filter(Boolean) as string[];
  const ready = missing.length === 0 && invalidCount === 0;
  const sentOk = results?.filter((r) => r.ok).length ?? 0;
  const formattedDate = meta.eventDate
    ? new Date(`${meta.eventDate}T12:00:00`).toLocaleDateString("es-PE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <p className="text-atlas-mist mb-8 max-w-[70ch] text-sm leading-relaxed">
        Genera y envía certificados de participación por correo. Los PDF se
        crean al momento y no se almacenan.
      </p>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <section aria-labelledby="cert-evento">
            <SectionHeading>
              <span id="cert-evento">1 · Evento</span>
            </SectionHeading>
            <p className="text-atlas-mist mb-4 text-sm">
              Elige un evento para completar los datos solos, o escríbelos a
              mano. El organizador es siempre GDG ICA.
            </p>

            <FormField label="Evento">
              <select
                className={inputCls}
                value={selectedEventId}
                disabled={loadingEvent}
                onChange={(e) => handleSelectEvent(e.target.value)}
              >
                <option value="">Ingresar los datos a mano</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </FormField>
            {loadingEvent && (
              <p role="status" className="text-atlas-mist mt-2 text-sm">
                Cargando datos del evento…
              </p>
            )}

            {selectedEventId && (
              <button
                type="button"
                onClick={() => setManualOpen((o) => !o)}
                aria-expanded={manualOpen}
                className={`${buttonClass.quiet} mt-3 -ml-2`}
              >
                <ArrowIcon
                  className={`size-4 transition-transform ${manualOpen ? "rotate-90" : ""}`}
                />
                Ajustar los datos a mano
              </button>
            )}

            <div className={showManualFields ? "mt-4" : "hidden"}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FormField label="Nombre del evento" required>
                    <input
                      className={inputCls}
                      value={meta.eventName}
                      onChange={(e) =>
                        setMetaField("eventName", e.target.value)
                      }
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
                    placeholder="9:00 a.m."
                  />
                </FormField>
                <FormField label="Hora de fin" required>
                  <input
                    className={inputCls}
                    value={meta.endTime}
                    onChange={(e) => setMetaField("endTime", e.target.value)}
                    placeholder="1:00 p.m."
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Organizador">
                    <input
                      className={inputCls}
                      value={meta.organizer}
                      onChange={(e) =>
                        setMetaField("organizer", e.target.value)
                      }
                      placeholder="GDG ICA"
                    />
                  </FormField>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="cert-destinatarios">
            <SectionHeading
              action={
                <label className={`${buttonClass.secondary} cursor-pointer`}>
                  Importar CSV
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="sr-only"
                    onChange={handleFile}
                  />
                </label>
              }
            >
              <span id="cert-destinatarios">2 · Destinatarios</span>
            </SectionHeading>
            <p className="text-atlas-mist mb-4 text-sm">
              Importa un CSV con las columnas nombre y correo, o agrégalos uno
              por uno.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addManual();
              }}
              className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="sr-only" htmlFor="cert-nombre">
                Nombre completo
              </label>
              <input
                id="cert-nombre"
                className={inputCls}
                value={manual.name}
                onChange={(e) =>
                  setManual((m) => ({ ...m, name: e.target.value }))
                }
                placeholder="Nombre completo"
              />
              <label className="sr-only" htmlFor="cert-correo">
                Correo
              </label>
              <input
                id="cert-correo"
                type="email"
                className={inputCls}
                value={manual.email}
                onChange={(e) =>
                  setManual((m) => ({ ...m, email: e.target.value }))
                }
                placeholder="correo@ejemplo.com"
              />
              <button type="submit" className={buttonClass.secondary}>
                Agregar
              </button>
            </form>

            {recipients.length > 0 ? (
              <div className="border-atlas-line rounded-xs border">
                <div className="border-atlas-line flex items-center justify-between border-b px-4 py-2.5 text-sm">
                  <span className="text-atlas-mist tabular-nums">
                    {recipients.length}{" "}
                    {recipients.length === 1 ? "destinatario" : "destinatarios"}
                    {invalidCount > 0 && (
                      <span className="text-atlas-rose ml-2">
                        · {invalidCount} con correo inválido
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecipients([])}
                    className="text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1 text-sm font-semibold"
                  >
                    Vaciar lista
                  </button>
                </div>
                <ul className="max-h-80 overflow-auto">
                  {recipients.map((r) => {
                    const bad = !EMAIL_RE.test(r.email);
                    return (
                      <li
                        key={r.email}
                        className="border-atlas-line flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-atlas-dust truncate">{r.name}</p>
                          <p
                            className={`truncate ${bad ? "text-atlas-rose" : "text-atlas-fog"}`}
                          >
                            {r.email}
                            {bad && " · correo inválido"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecipient(r.email)}
                          className="text-atlas-fog hover:text-atlas-rose shrink-0 rounded-md p-1 transition-colors"
                          aria-label={`Quitar a ${r.name}`}
                        >
                          <CloseIcon className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-4 py-6 text-center text-sm">
                Sin destinatarios todavía.
              </p>
            )}
          </section>

          {results && (
            <section aria-labelledby="cert-resultado">
              <SectionHeading
                action={
                  <span className="text-atlas-mist text-sm tabular-nums">
                    {sentOk} de {results.length} enviados
                  </span>
                }
              >
                <span id="cert-resultado">Resultado del envío</span>
              </SectionHeading>
              <ul className="border-atlas-line rounded-xs border text-sm">
                {results.map((r) => (
                  <li
                    key={r.email}
                    className="border-atlas-line flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-atlas-mist min-w-0 truncate">
                      <span className="text-atlas-dust">{r.name}</span> ·{" "}
                      {r.email}
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${r.ok ? "text-atlas-ok" : "text-atlas-rose"}`}
                    >
                      {r.ok ? "Enviado" : r.error || "Falló"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside
          aria-label="Resumen del envío"
          className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
        >
          <CornerNodes />
          <p className="atlas-label text-atlas-glow">Resumen del envío</p>
          <p className="atlas-name text-atlas-dust mt-3 text-lg leading-snug">
            {meta.eventName.trim() || "Sin evento todavía"}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Fecha</dt>
              <dd className="text-atlas-dust text-right first-letter:uppercase">
                {formattedDate ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Horario</dt>
              <dd className="text-atlas-dust text-right">
                {meta.startTime && meta.endTime
                  ? `${meta.startTime} – ${meta.endTime}`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Horas</dt>
              <dd className="text-atlas-dust tabular-nums">
                {Number(meta.hours) > 0 ? `${meta.hours} h` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Organizador</dt>
              <dd className="text-atlas-dust text-right">
                {meta.organizer || "—"}
              </dd>
            </div>
            <div className="border-atlas-line flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="text-atlas-fog">Destinatarios</dt>
              <dd className="text-atlas-dust text-2xl font-semibold tabular-nums">
                {recipients.length}
              </dd>
            </div>
          </dl>

          {!ready && (
            <p className="text-atlas-mist mt-4 text-sm">
              {invalidCount > 0
                ? `Corrige o quita ${invalidCount} ${invalidCount === 1 ? "correo inválido" : "correos inválidos"}.`
                : `Falta: ${missing.join(", ")}.`}
            </p>
          )}

          <button
            type="button"
            disabled={sending || !ready}
            onClick={handleSend}
            className={`${buttonClass.primary} mt-5 w-full`}
          >
            {sending
              ? "Enviando…"
              : recipients.length === 1
                ? "Generar y enviar 1 certificado"
                : `Generar y enviar ${recipients.length} certificados`}
          </button>
          <p className="text-atlas-fog mt-3 text-xs leading-snug">
            Cada persona recibe su PDF por correo. El envío no se puede
            deshacer.
          </p>
        </aside>
      </div>
    </div>
  );
}

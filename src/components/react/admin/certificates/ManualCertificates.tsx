import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CertificateItem, type CertificateKind } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import {
  CornerNodes,
  ReticleIcon,
  SectionHeading,
  Tag,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import {
  PeopleRowsEditor,
  checkPeople,
  issuesByRow,
  type PersonDraft,
} from "./PeopleRowsEditor";
import {
  EMPTY_DRAFT,
  SettingsFields,
  draftErrors,
  fromDraft,
  toDraft,
  type DraftErrors,
  type SettingsDraft,
} from "./SettingsFields";
import { CERT_KINDS, STATUS, certificates, kindInfo, people } from "./kinds";
import { formatDate, formatMoment, formatTime } from "./format";
import { openPdf } from "./openPdf";
import { POLL_MS } from "./useEventCertificates";

type ToastState = { message: string; type: "success" | "error" } | null;

interface EventOption {
  id: string;
  title: string;
}

const newSubmissionId = () => crypto.randomUUID();

/**
 * Certificates for extraordinary cases: people typed in or imported from a
 * CSV, with event data that can come from an event in the list or be
 * written by hand. They go into the same queue as the event certificates.
 */
export function ManualCertificates() {
  const [kind, setKind] = useState<CertificateKind>("attendee");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventSlug, setEventSlug] = useState("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft>({ ...EMPTY_DRAFT });
  const [draftErrs, setDraftErrs] = useState<DraftErrors>({});
  const [rows, setRows] = useState<PersonDraft[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  // One id per filled-in form: a retried submit after a timeout reuses it,
  // and the server queues nobody twice.
  const submissionId = useRef(newSubmissionId());
  const history = useManualHistory();

  useEffect(() => {
    void api.listEvents().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setEvents(
          (res.data as { id: string; title?: string }[]).map((e) => ({
            id: e.id,
            title: e.title || e.id,
          }))
        );
      }
    });
  }, []);

  const pickEvent = async (slug: string) => {
    setEventSlug(slug);
    if (!slug) return;
    setLoadingEvent(true);
    const res = await api.getCertificateSettings(slug);
    setLoadingEvent(false);
    if (res.success && res.data?.settings) {
      setDraft(toDraft(res.data.settings));
    } else {
      setToast({
        message:
          res.error || "No se pudieron leer los datos del evento; escríbelos.",
        type: "error",
      });
    }
  };

  const checked = checkPeople(rows);
  const settingsErrors = draftErrors(draft, kind !== "speaker");
  const ready =
    checked.valid.length > 0 &&
    Object.keys(checked.errors).length === 0 &&
    Object.keys(settingsErrors).length === 0;

  const tryConfirm = () => {
    setDraftErrs(settingsErrors);
    setRowErrors(checked.errors);
    if (ready) setConfirming(true);
  };

  const send = async () => {
    setSending(true);
    const res = await api.createManualCertificates({
      submissionId: submissionId.current,
      kind,
      eventSlug: eventSlug || null,
      content: fromDraft(draft),
      recipients: checked.valid.map(({ firstName, lastName, email }) => ({
        firstName,
        lastName,
        email,
      })),
    });
    setSending(false);
    if (!res.success || !res.data) {
      setRowErrors(issuesByRow(res.issues, checked.valid, "recipients"));
      setToast({
        message:
          res.error === "Invalid request body"
            ? "El servidor rechazó algunas filas; están marcadas."
            : res.error || "No se pudo enviar. Ningún certificado salió.",
        type: "error",
      });
      setConfirming(false);
      return;
    }
    const { queued, existing } = res.data;
    setToast({
      message:
        queued > 0
          ? `${certificates(queued)} en camino; salen en unos segundos.`
          : existing > 0
            ? "Este envío ya se había hecho; no se repitió."
            : "No se envió ningún certificado.",
      type: queued > 0 || existing > 0 ? "success" : "error",
    });
    setRows([]);
    setRowErrors({});
    setConfirming(false);
    submissionId.current = newSubmissionId();
    history.refresh();
  };

  const preview = async () => {
    setDraftErrs(settingsErrors);
    if (Object.keys(settingsErrors).length > 0) return;
    const first = checked.valid[0];
    const problem = await openPdf(() =>
      api.previewCertificate({
        kind,
        name: first
          ? `${first.firstName} ${first.lastName}`.trim()
          : "Nombre Apellido",
        content: fromDraft(draft),
      })
    );
    if (problem) setToast({ message: problem, type: "error" });
  };

  const info = kindInfo(kind);
  const settings = fromDraft(draft);

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
        Para casos que no salen del check-in ni de las listas del evento:
        alguien que llegó sin registrarse, un evento antiguo, un taller fuera de
        la agenda. Escribe a las personas o importa un CSV, elige el tipo y
        envía.{" "}
        <a
          href="/admin/certificates"
          className="text-atlas-dust underline underline-offset-2"
        >
          Volver a los certificados por evento
        </a>
      </p>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <section aria-labelledby="manual-tipo">
            <SectionHeading>
              <span id="manual-tipo">Certificado</span>
            </SectionHeading>
            <fieldset>
              <legend className="sr-only">Tipo de certificado</legend>
              <div className="border-atlas-line rounded-xs border">
                {CERT_KINDS.map((k) => {
                  const selected = kind === k.value;
                  return (
                    <label
                      key={k.value}
                      className={`border-atlas-line has-focus-visible:outline-atlas-star flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-b-0 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 ${
                        selected ? "bg-atlas-deep" : "hover:bg-atlas-deep/60"
                      }`}
                    >
                      <input
                        type="radio"
                        name="manual-kind"
                        value={k.value}
                        checked={selected}
                        onChange={() => setKind(k.value)}
                        className="sr-only"
                      />
                      <ReticleIcon
                        className={`mt-0.5 size-4 shrink-0 ${
                          selected ? "text-atlas-star" : "text-atlas-line"
                        }`}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block text-sm ${
                            selected
                              ? "text-atlas-dust font-semibold"
                              : "text-atlas-mist"
                          }`}
                        >
                          {k.label}
                        </span>
                        <span className="text-atlas-fog mt-0.5 block text-sm leading-snug">
                          {k.value === "attendee"
                            ? "Para quienes participaron del evento."
                            : k.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="manual-evento">
            <SectionHeading>
              <span id="manual-evento">Evento</span>
            </SectionHeading>
            <div className="mb-4">
              <FormField label="Tomar los datos de">
                <select
                  className={inputClass}
                  value={eventSlug}
                  disabled={loadingEvent}
                  onChange={(e) => void pickEvent(e.target.value)}
                >
                  <option value="">Ningún evento: los escribo yo</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </FormField>
              {loadingEvent && (
                <p role="status" className="text-atlas-mist mt-2 text-sm">
                  Cargando los datos del evento…
                </p>
              )}
            </div>
            <SettingsFields
              idPrefix="manual-settings"
              draft={draft}
              onChange={setDraft}
              errors={draftErrs}
            />
            <p className="text-atlas-fog mt-3 text-sm">
              Cambiarlos aquí no cambia los del evento: solo valen para este
              envío.
            </p>
          </section>

          <section aria-labelledby="manual-personas">
            <SectionHeading>
              <span id="manual-personas">Personas</span>
            </SectionHeading>
            <PeopleRowsEditor
              rows={rows}
              onChange={(next) => {
                setRows(next);
                setConfirming(false);
              }}
              errors={rowErrors}
              onImportNotice={(message, type) => setToast({ message, type })}
            />
          </section>

          <ManualHistory history={history} />
        </div>

        <aside
          aria-label="Resumen del envío"
          className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border p-5 lg:sticky lg:top-0"
        >
          <CornerNodes />
          <p className="atlas-label text-atlas-glow">Resumen</p>
          <p className="atlas-name text-atlas-dust mt-3 text-lg leading-snug">
            {settings.eventName || "Sin evento todavía"}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Certificado</dt>
              <dd className="text-atlas-dust text-right">{info.label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Fecha</dt>
              <dd className="text-atlas-dust text-right first-letter:uppercase">
                {settings.eventDate ? formatDate(settings.eventDate) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-atlas-fog">Horario</dt>
              <dd className="text-atlas-dust text-right">
                {settings.startTime && settings.endTime
                  ? `${formatTime(settings.startTime)} – ${formatTime(settings.endTime)}`
                  : "—"}
              </dd>
            </div>
            {kind !== "speaker" && (
              <div className="flex justify-between gap-4">
                <dt className="text-atlas-fog">Horas</dt>
                <dd className="text-atlas-dust tabular-nums">
                  {settings.hours > 0 ? `${settings.hours} h` : "—"}
                </dd>
              </div>
            )}
            <div className="border-atlas-line flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="text-atlas-fog">Personas</dt>
              <dd className="text-atlas-dust text-2xl font-semibold tabular-nums">
                {checked.filled}
              </dd>
            </div>
          </dl>

          {confirming ? (
            <div className="mt-5">
              <p className="text-atlas-dust text-sm">
                Se enviará el certificado {info.what} a{" "}
                {people(checked.valid.length)}. Un correo enviado no se puede
                retirar.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  className={`${buttonClass.primary} w-full`}
                  disabled={sending}
                  onClick={send}
                >
                  {sending
                    ? "Enviando…"
                    : `Sí, enviar ${certificates(checked.valid.length)}`}
                </button>
                <button
                  type="button"
                  className={`${buttonClass.quiet} justify-center`}
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`${buttonClass.primary} mt-5 w-full`}
                disabled={checked.filled === 0}
                onClick={tryConfirm}
              >
                {`Enviar ${certificates(checked.filled)}`}
              </button>
              <button
                type="button"
                className={`${buttonClass.secondary} mt-2 w-full`}
                onClick={preview}
              >
                Vista previa
              </button>
            </>
          )}
          <p className="text-atlas-fog mt-3 text-xs leading-snug">
            Guardamos a quién y cuándo se envió; el PDF se genera al enviarlo y
            no se guarda.
          </p>
        </aside>
      </div>
    </div>
  );
}

function useManualHistory() {
  const [items, setItems] = useState<CertificateItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const res = await api.listManualCertificates();
    if (res.success && res.data) {
      setItems(res.data.items);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const busy = (items ?? []).some(
    (i) => i.status === "queued" || i.status === "sending"
  );
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  return { items, failed, refresh };
}

function ManualHistory({
  history,
}: {
  history: ReturnType<typeof useManualHistory>;
}) {
  const { items, failed } = history;
  return (
    <section aria-labelledby="manual-historial">
      <SectionHeading>
        <span id="manual-historial">Enviados a mano</span>
      </SectionHeading>
      {failed ? (
        <p className="text-atlas-mist text-sm">
          No se pudo cargar el historial.
        </p>
      ) : !items ? (
        <p role="status" className="text-atlas-mist text-sm">
          Cargando…
        </p>
      ) : items.length === 0 ? (
        <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          Aún no se envió ningún certificado a mano.
        </p>
      ) : (
        <ul className="border-atlas-line rounded-xs border text-sm">
          {items.map((i) => {
            const status = STATUS[i.status];
            return (
              <li
                key={i.id}
                className="border-atlas-line flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <span className="text-atlas-dust block truncate">
                    {i.name}
                  </span>
                  <span className="text-atlas-fog block truncate">
                    {i.email} · {kindInfo(i.kind).label}
                    {i.content?.eventName ? ` · ${i.content.eventName}` : ""}
                  </span>
                </span>
                <Tag tone={status.tone}>
                  {status.label}
                  {i.status === "sent" && i.sentAt ? (
                    <span className="font-normal">
                      {" "}
                      · {formatMoment(i.sentAt)}
                    </span>
                  ) : null}
                </Tag>
                {i.status === "failed" && (
                  <span className="text-atlas-rose w-full break-words">
                    {i.lastError ? `${i.lastError}. ` : ""}Revisa el correo y
                    vuelve a enviarlo desde el formulario.
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

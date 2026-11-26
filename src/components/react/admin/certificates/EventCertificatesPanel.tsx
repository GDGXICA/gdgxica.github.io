import { useEffect, useMemo, useState } from "react";
import {
  api,
  type CertificateItem,
  type CertificateKind,
  type EventCertificates,
} from "@/lib/api";
import { Toast } from "../ui/Toast";
import {
  CornerNodes,
  ErrorState,
  LoadingState,
  SectionHeading,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import { CertificateRow, type RowAction } from "./CertificateRow";
import {
  PeopleRowsEditor,
  checkPeople,
  issuesByRow,
  type PersonDraft,
} from "./PeopleRowsEditor";
import {
  SettingsFields,
  draftErrors,
  fromDraft,
  sameDraft,
  toDraft,
  type DraftErrors,
  type SettingsDraft,
} from "./SettingsFields";
import {
  CERT_KINDS,
  certificates,
  describeMissing,
  describeSkipped,
  kindInfo,
  people,
} from "./kinds";
import { formatDate, formatTime } from "./format";
import { openPdf } from "./openPdf";
import { useEventCertificates } from "./useEventCertificates";

type ToastState = { message: string; type: "success" | "error" } | null;

const sendable = (i: CertificateItem) =>
  (i.status === "pending" || i.status === "cancelled") &&
  (i.kind !== "attendee" || !!i.checkin);

/** What the send endpoint expects: roster ids for attendees. */
const sendId = (i: CertificateItem) =>
  i.kind === "attendee" && i.rosterId ? i.rosterId : i.id;

function matches(item: CertificateItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${item.name} ${item.email}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .includes(q);
}

export function EventCertificatesPanel({ slug }: { slug: string }) {
  const { data, error, load, replace, remove, setSettings, markQueued } =
    useEventCertificates(slug);
  const [toast, setToast] = useState<ToastState>(null);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Cargando certificados…" />;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <p className="text-atlas-mist max-w-[70ch] text-sm leading-relaxed">
        Cada persona recibe por correo su certificado en PDF, con el diseño de
        su tipo. Nada se envía solo: tú decides cuándo, a quién o a todos los
        pendientes.{" "}
        <span className="text-atlas-fog">
          Hoy van {data.budget.sentToday} de {data.budget.cap} correos del día
          (certificados y credenciales); lo que pase el límite sale mañana.
        </span>
      </p>

      <SettingsSection
        slug={slug}
        data={data}
        onSaved={setSettings}
        onToast={setToast}
      />

      <PeopleSection
        slug={slug}
        data={data}
        onToast={setToast}
        replace={replace}
        remove={remove}
        markQueued={markQueued}
      />
    </div>
  );
}

function SettingsSection({
  slug,
  data,
  onSaved,
  onToast,
}: {
  slug: string;
  data: EventCertificates;
  onSaved: (s: NonNullable<EventCertificates["settings"]>) => void;
  onToast: (t: ToastState) => void;
}) {
  const saved = useMemo(() => toDraft(data.settings), [data.settings]);
  const [draft, setDraft] = useState<SettingsDraft>(saved);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const dirty = !data.settingsSaved || !sameDraft(draft, saved);

  const save = async () => {
    const found = draftErrors(draft, false);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const res = await api.saveCertificateSettings(slug, fromDraft(draft));
    setBusy(false);
    if (!res.success || !res.data) {
      onToast({
        message: res.error || "No se pudieron guardar los datos.",
        type: "error",
      });
      return;
    }
    onSaved(res.data.settings);
    setDraft(toDraft(res.data.settings));
    onToast({ message: "Datos del certificado guardados.", type: "success" });
  };

  return (
    <section aria-labelledby="cert-datos">
      <SectionHeading>
        <span id="cert-datos">Datos del certificado</span>
      </SectionHeading>
      <p className="text-atlas-mist mb-5 max-w-[70ch] text-sm">
        {data.settingsSaved
          ? "Así se imprimen en cada certificado. Si los cambias, los que aún no salieron usarán los nuevos."
          : "Los tomamos del evento. Revísalos y guárdalos: hasta entonces no se puede enviar nada."}
      </p>
      <SettingsFields
        idPrefix="cert-settings"
        draft={draft}
        onChange={setDraft}
        errors={errors}
      />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={dirty ? buttonClass.primary : buttonClass.secondary}
          disabled={busy || !dirty}
          onClick={save}
        >
          {busy ? "Guardando…" : dirty ? "Guardar datos" : "Datos guardados"}
        </button>
        <span className="text-atlas-fog text-sm">Ver un ejemplo:</span>
        {CERT_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className={buttonClass.quiet}
            aria-label={`Ver un ejemplo del certificado ${k.what}`}
            onClick={async () => {
              const problem = await openPdf(() =>
                api.previewCertificate({
                  kind: k.value,
                  name: "Nombre Apellido",
                  content: fromDraft(draft),
                })
              );
              if (problem) onToast({ message: problem, type: "error" });
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      {!dirty && data.settings && (
        <p className="text-atlas-fog mt-3 text-sm first-letter:uppercase">
          {formatDate(data.settings.eventDate)}, de{" "}
          {formatTime(data.settings.startTime)} a{" "}
          {formatTime(data.settings.endTime)}
          {data.settings.hours > 0 ? ` · ${data.settings.hours} h` : ""}
        </p>
      )}
    </section>
  );
}

function PeopleSection({
  slug,
  data,
  onToast,
  replace,
  remove,
  markQueued,
}: {
  slug: string;
  data: EventCertificates;
  onToast: (t: ToastState) => void;
  replace: (item: CertificateItem, previousId?: string | null) => void;
  remove: (id: string) => void;
  markQueued: (ids: Set<string>) => void;
}) {
  const [tab, setTab] = useState<CertificateKind>("attendee");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"pending" | "failed" | null>(
    null
  );
  const [sending, setSending] = useState(false);

  const lists: Record<CertificateKind, CertificateItem[]> = {
    attendee: data.attendees,
    volunteer: data.people.filter((p) => p.kind === "volunteer"),
    speaker: data.people.filter((p) => p.kind === "speaker"),
  };
  const list = [...lists[tab]].sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
  const shown = list.filter((i) => matches(i, query));
  const pending = list.filter(sendable);
  const failed = list.filter((i) => i.status === "failed");
  const toConfirm = confirming === "failed" ? failed : pending;
  const settingsMissing = data.settings
    ? describeMissing(
        tab === "speaker" ? [] : data.settings.hours > 0 ? [] : ["hours"]
      )
    : "";
  const canSend = data.settingsSaved && !settingsMissing;
  const info = kindInfo(tab);

  useEffect(() => setConfirming(null), [tab]);

  const enqueue = async (items: CertificateItem[], resend = false) => {
    const ids = items.map(sendId);
    const res = await api.enqueueCertificates(slug, { kind: tab, ids, resend });
    if (!res.success || !res.data) {
      onToast({
        message:
          res.missing && res.missing.length > 0
            ? `Antes de enviar, completa ${describeMissing(res.missing)} en los datos del certificado.`
            : res.error || "No se pudo enviar. No salió ningún certificado.",
        type: "error",
      });
      return false;
    }
    const skipped = new Set(res.data.skipped.map((s) => s.id));
    markQueued(new Set(ids.filter((id) => !skipped.has(id))));
    const { queued } = res.data;
    onToast({
      message:
        (queued === 0
          ? "No se envió ningún certificado."
          : `${certificates(queued)} en camino; salen en unos segundos.`) +
        (res.data.skipped.length > 0
          ? ` Se omitieron: ${describeSkipped(res.data.skipped)}.`
          : ""),
      type: queued === 0 ? "error" : "success",
    });
    return true;
  };

  const onAction = async (item: CertificateItem, action: RowAction) => {
    setBusyId(item.id);
    try {
      if (action.type === "send") {
        await enqueue([item], action.resend);
      } else if (action.type === "cancel") {
        const res = await api.cancelCertificates(slug, [item.id]);
        if (res.success && res.data?.cancelled) {
          replace({ ...item, status: "pending" });
        } else {
          onToast({
            message: res.error || "Ya estaba saliendo; no se pudo cancelar.",
            type: "error",
          });
        }
      } else if (action.type === "preview") {
        if (!data.settings) return;
        const problem = await openPdf(() =>
          api.previewCertificate({
            kind: item.kind,
            name: item.name,
            content: data.settings!,
            hours: item.hours,
          })
        );
        if (problem) onToast({ message: problem, type: "error" });
      } else if (action.type === "remove") {
        if (!window.confirm(`¿Quitar a ${item.name} de la lista?`)) return;
        const res = await api.removeCertificatePerson(slug, item.id);
        if (res.success) remove(item.id);
        else
          onToast({
            message: res.error || "No se pudo quitar.",
            type: "error",
          });
      } else if (action.type === "patch") {
        const res = await api.updateCertificatePerson(
          slug,
          item.id,
          action.patch
        );
        if (res.success && res.data) {
          replace(
            { ...res.data.certificate, checkin: item.checkin },
            res.data.previousId
          );
        } else {
          onToast({
            message: res.error || "No se pudo guardar el cambio.",
            type: "error",
          });
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const sendAll = async () => {
    setSending(true);
    const done = await enqueue(toConfirm);
    setSending(false);
    if (done) setConfirming(null);
  };

  const notCheckedIn =
    data.roster.total !== null
      ? Math.max(0, data.roster.total - data.roster.checkedIn)
      : null;

  return (
    <section aria-labelledby="cert-personas">
      <SectionHeading>
        <span id="cert-personas">Quiénes lo reciben</span>
      </SectionHeading>

      <div
        role="group"
        aria-label="Tipo de certificado"
        className="border-atlas-line mb-5 inline-flex flex-wrap gap-1 rounded-md border p-1"
      >
        {CERT_KINDS.map((k) => {
          const n = lists[k.value].length;
          return (
            <button
              key={k.value}
              type="button"
              aria-pressed={tab === k.value}
              onClick={() => setTab(k.value)}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === k.value
                  ? "bg-atlas-deep text-atlas-dust"
                  : "text-atlas-mist hover:text-atlas-dust"
              }`}
            >
              {k.label} <span className="text-atlas-fog tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      <p className="text-atlas-mist mb-4 max-w-[70ch] text-sm">
        {tab === "attendee" ? (
          <>
            Solo aparecen quienes hicieron check-in, en el panel o en Bevy.
            {notCheckedIn ? (
              <>
                {" "}
                {people(notCheckedIn)}{" "}
                {notCheckedIn === 1 ? "inscrita" : "inscritas"} sin check-in no{" "}
                {notCheckedIn === 1 ? "recibe" : "reciben"} certificado.
              </>
            ) : null}{" "}
            <a
              href={`/admin/checkin?slug=${encodeURIComponent(slug)}`}
              className="text-atlas-dust underline underline-offset-2"
            >
              Ir al check-in
            </a>
          </>
        ) : (
          `${info.description} Regístralos con su correo; nadie recibe nada hasta que lo envíes.`
        )}
      </p>

      {tab !== "attendee" && (
        <RegisterPeople
          key={tab}
          slug={slug}
          kind={tab}
          onAdded={(added) => {
            for (const item of added) replace(item);
          }}
          onToast={onToast}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="cert-search">
          Buscar por nombre o correo
        </label>
        <input
          id="cert-search"
          type="search"
          className={`${inputClass} max-w-xs`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o correo"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          {failed.length > 0 && (
            <button
              type="button"
              className={buttonClass.secondary}
              disabled={!canSend}
              aria-expanded={confirming === "failed"}
              onClick={() =>
                setConfirming((c) => (c === "failed" ? null : "failed"))
              }
            >
              Reintentar fallidos
              <span className="text-atlas-mist tabular-nums">
                {failed.length}
              </span>
            </button>
          )}
          <button
            type="button"
            className={
              pending.length > 0 ? buttonClass.primary : buttonClass.secondary
            }
            disabled={!canSend || pending.length === 0}
            aria-expanded={confirming === "pending"}
            onClick={() =>
              setConfirming((c) => (c === "pending" ? null : "pending"))
            }
          >
            {pending.length === 0
              ? "Nadie pendiente"
              : `Enviar a ${pending.length} ${pending.length === 1 ? "pendiente" : "pendientes"}`}
          </button>
        </div>
      </div>

      {!canSend && (
        <p className="text-atlas-glow mb-3 text-sm">
          {!data.settingsSaved
            ? "Guarda los datos del certificado para poder enviar."
            : `Falta ${settingsMissing} en los datos del certificado.`}
        </p>
      )}

      {confirming && toConfirm.length > 0 && (
        <div className="border-atlas-line bg-atlas-deep/40 relative mb-4 rounded-xs border p-5">
          <CornerNodes />
          <p className="text-atlas-dust font-semibold">
            Certificado {info.what} para {people(toConfirm.length)}
          </p>
          <p className="text-atlas-mist mt-1 text-sm">
            Cada persona recibe su PDF por correo. Revisa la lista: un correo
            enviado no se puede retirar.
          </p>
          <ul className="border-atlas-line bg-atlas-night my-4 max-h-56 overflow-y-auto rounded-xs border text-sm">
            {toConfirm.map((i) => (
              <li
                key={i.id}
                className="border-atlas-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b px-4 py-2 last:border-b-0"
              >
                <span className="text-atlas-dust min-w-0 truncate">
                  {i.name}
                </span>
                <span className="text-atlas-fog min-w-0 truncate">
                  {i.email}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={buttonClass.quiet}
              onClick={() => setConfirming(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={buttonClass.primary}
              disabled={sending}
              onClick={sendAll}
            >
              {sending
                ? "Enviando…"
                : `Enviar ${certificates(toConfirm.length)}`}
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          {tab === "attendee"
            ? "Todavía nadie tiene check-in. Cuando marques asistencia en el check-in, o importes el CSV de Bevy con su check-in, aparecerán aquí."
            : `Aún no registraste ${tab === "volunteer" ? "voluntarios" : "speakers"}. Agrégalos arriba.`}
        </p>
      ) : (
        <ul className="border-atlas-line rounded-xs border">
          {shown.map((item) => (
            <CertificateRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              canSend={canSend}
              onAction={(action) => onAction(item, action)}
            />
          ))}
          {shown.length === 0 && (
            <li className="text-atlas-mist px-4 py-6 text-sm">
              Nadie coincide con «{query}».
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function RegisterPeople({
  slug,
  kind,
  onAdded,
  onToast,
}: {
  slug: string;
  kind: "volunteer" | "speaker";
  onAdded: (items: CertificateItem[]) => void;
  onToast: (t: ToastState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PersonDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const checked = checkPeople(rows);
  const label = kind === "volunteer" ? "voluntarios" : "speakers";

  const submit = async () => {
    setErrors(checked.errors);
    if (Object.keys(checked.errors).length > 0 || checked.valid.length === 0)
      return;
    setBusy(true);
    const res = await api.addCertificatePeople(
      slug,
      kind,
      checked.valid.map(({ firstName, lastName, email, hours }) => ({
        firstName,
        lastName,
        email,
        ...(kind === "volunteer" ? { hours } : {}),
      }))
    );
    setBusy(false);
    if (!res.success || !res.data) {
      setErrors(issuesByRow(res.issues, checked.valid, "people"));
      onToast({
        message: res.error || "No se pudieron registrar.",
        type: "error",
      });
      return;
    }
    onAdded(res.data.added);
    const n = res.data.added.length;
    const repeated = res.data.skipped.length;
    onToast({
      message:
        (n === 1 ? "Se registró 1 persona." : `Se registraron ${n} personas.`) +
        (repeated > 0
          ? ` ${repeated === 1 ? "1 ya estaba registrada" : `${repeated} ya estaban registradas`}.`
          : ""),
      type: n > 0 ? "success" : "error",
    });
    setRows([]);
    setErrors({});
    setOpen(false);
  };

  return (
    <div className="mb-5">
      <button
        type="button"
        className={buttonClass.secondary}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Cerrar" : `Registrar ${label}`}
      </button>
      {open && (
        <div className="border-atlas-line bg-atlas-deep/40 relative mt-3 rounded-xs border p-5">
          <CornerNodes />
          <PeopleRowsEditor
            rows={rows}
            onChange={setRows}
            withHours={kind === "volunteer"}
            errors={errors}
            onImportNotice={(message, type) => onToast({ message, type })}
          />
          {kind === "volunteer" && (
            <p className="text-atlas-fog mt-3 text-sm">
              Horas vacías: se acreditan las del evento.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className={buttonClass.quiet}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={buttonClass.secondary}
              disabled={busy || checked.filled === 0}
              onClick={submit}
            >
              {busy
                ? "Registrando…"
                : checked.filled === 1
                  ? "Registrar 1 persona"
                  : `Registrar ${checked.filled} personas`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

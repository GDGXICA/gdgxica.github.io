import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import { FormField } from "../ui/FormField";
import { useAuth } from "../AuthProvider";
import { useEventCatalog } from "../useEventCatalog";
import {
  CornerNodes,
  LoadingState,
  ReticleIcon,
  SectionHeading,
  Tag,
  buttonClass,
  inputClass,
} from "../ui/atlas";
import {
  ROLE_BUNDLES,
  ROLE_LABELS,
  STAFF_CAPABILITY_IDS,
  STAFF_CAPABILITY_LABELS,
  isRole,
  type Role,
  type StaffCapability,
} from "@/lib/permissions";

/** Roles cuyos permisos dependen de estar asignado a un evento. */
const SCOPED_ROLES = (Object.keys(ROLE_BUNDLES) as Role[]).filter(
  (role) => ROLE_BUNDLES[role].perEvent.length > 0
);

interface StaffEntry {
  uid: string;
  role?: string;
  assignedBy?: string;
  expiresAt?: string | { _seconds: number } | null;
  reason?: string;
  /** `null`: assignment made before capabilities; it grants everything. */
  permissions?: string[] | null;
  capabilities?: StaffCapability[];
  active: boolean;
}

interface Candidate {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status?: string;
}

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("slug");
}

function toDate(value: StaffEntry["expiresAt"]): Date | null {
  if (!value) return null;
  const ms =
    typeof value === "object" && "_seconds" in value
      ? value._seconds * 1000
      : new Date(value as string).getTime();
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** "2026-11-28" for a date input, in local time. */
function toDateInput(value: StaffEntry["expiresAt"]): string {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const EMPTY_FORM = {
  uid: "",
  capabilities: [] as StaffCapability[],
  expiresAt: "",
  reason: "",
};

/**
 * Who works an event, and what each person can do there. Every capability
 * is chosen explicitly: an external volunteer who only marks attendance at
 * the door gets only the check-in, nothing else.
 */
export function EventStaffPanel() {
  const { can } = useAuth();
  const canAssign = can("users:role:write");
  const catalog = useEventCatalog();

  const [slug] = useState<string | null>(slugFromUrl());
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const load = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [staffRes, usersRes] = await Promise.all([
      api.listEventStaff(slug),
      canAssign ? api.listUsers() : Promise.resolve({ success: false }),
    ]);
    if (staffRes.success && staffRes.data) {
      setStaff(staffRes.data as StaffEntry[]);
    }
    if (usersRes.success && "data" in usersRes && usersRes.data) {
      // Solo se ofrecen los roles que ganan algo con la asignación: para el
      // resto, el documento no concedería nada y confundiría.
      setCandidates(
        (usersRes.data as Candidate[]).filter(
          (u) =>
            isRole(u.role) &&
            SCOPED_ROLES.includes(u.role) &&
            u.status !== "suspended"
        )
      );
    }
    setLoading(false);
  }, [slug, canAssign]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (cap: StaffCapability) =>
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter((c) => c !== cap)
        : [...f.capabilities, cap],
    }));

  const startEditing = (entry: StaffEntry) => {
    setForm({
      uid: entry.uid,
      capabilities: entry.capabilities ?? [],
      expiresAt: toDateInput(entry.expiresAt),
      reason: entry.reason ?? "",
    });
    setEditing(true);
    setTriedSubmit(false);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditing(false);
    setTriedSubmit(false);
  };

  const missing = [
    !form.uid && "la persona",
    form.capabilities.length === 0 && "al menos una capacidad",
    !form.reason.trim() && "el motivo",
  ].filter(Boolean) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTriedSubmit(true);
    if (!slug || missing.length > 0) return;
    setBusy(form.uid);
    const res = await api.assignEventStaff(slug, form.uid, {
      capabilities: form.capabilities,
      reason: form.reason.trim(),
      expiresAt: form.expiresAt
        ? new Date(`${form.expiresAt}T23:59:59`).toISOString()
        : null,
    });
    setBusy(null);
    if (res.success) {
      setToast({
        message: editing
          ? "Asignación actualizada"
          : "Persona asignada al evento",
        type: "success",
      });
      resetForm();
      load();
    } else {
      setToast({ message: res.error || "No se pudo asignar", type: "error" });
    }
  }

  async function remove(entry: StaffEntry) {
    if (!slug) return;
    if (!confirm("¿Quitar a esta persona del equipo del evento?")) return;
    setBusy(entry.uid);
    const res = await api.removeEventStaff(slug, entry.uid);
    if (res.success) {
      setStaff((prev) => prev.filter((s) => s.uid !== entry.uid));
      if (form.uid === entry.uid) resetForm();
      setToast({ message: "Asignación retirada", type: "success" });
    } else {
      setToast({ message: res.error || "Error", type: "error" });
    }
    setBusy(null);
  }

  if (!slug) {
    return (
      <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-6 text-sm">
        Falta el evento. Entra desde la lista de eventos, en «Staff».
      </p>
    );
  }

  if (loading) return <LoadingState label="Cargando el equipo del evento…" />;

  const eventName = catalog.events?.find((e) => e.slug === slug)?.name ?? slug;
  const named = (uid: string) => {
    const c = candidates.find((x) => x.uid === uid);
    return c ? c.displayName || c.email : uid;
  };
  const alreadyAssigned = new Set(staff.map((s) => s.uid));

  return (
    <div className="max-w-4xl space-y-10">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <p className="text-atlas-mist max-w-[70ch] text-sm leading-relaxed">
        Equipo de <span className="text-atlas-dust">{eventName}</span>. Cada
        persona hace solo lo que marques, en este evento y mientras dure su
        asignación; al caducar, el acceso se apaga solo.
      </p>

      {canAssign && (
        <section aria-labelledby="staff-form">
          <SectionHeading>
            <span id="staff-form">
              {editing ? `Editar a ${named(form.uid)}` : "Asignar a alguien"}
            </span>
          </SectionHeading>
          {candidates.length === 0 ? (
            <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-6 text-sm">
              No hay nadie con un rol que se asigne por evento (
              {SCOPED_ROLES.map((r) => ROLE_LABELS[r]).join(", ")}). Invítalo o
              cambia su rol en Usuarios.
            </p>
          ) : (
            <form
              onSubmit={submit}
              className="border-atlas-line bg-atlas-deep/40 relative space-y-5 rounded-xs border p-5"
            >
              <CornerNodes />
              <FormField label="Persona" required>
                <select
                  value={form.uid}
                  disabled={editing}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, uid: e.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="">Elige…</option>
                  {candidates.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.displayName || c.email} ·{" "}
                      {ROLE_LABELS[c.role as Role] ?? c.role}
                      {alreadyAssigned.has(c.uid) && !editing
                        ? " · ya asignada"
                        : ""}
                    </option>
                  ))}
                </select>
              </FormField>

              <fieldset>
                <legend className="text-atlas-mist mb-1.5 text-sm font-semibold">
                  Qué puede hacer en este evento
                  <span className="text-atlas-star"> *</span>
                </legend>
                <div className="border-atlas-line rounded-xs border">
                  {STAFF_CAPABILITY_IDS.map((cap) => {
                    const checked = form.capabilities.includes(cap);
                    const info = STAFF_CAPABILITY_LABELS[cap];
                    return (
                      <label
                        key={cap}
                        className={`border-atlas-line has-focus-visible:outline-atlas-star flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-b-0 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 ${
                          checked ? "bg-atlas-deep" : "hover:bg-atlas-deep/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(cap)}
                          className="sr-only"
                        />
                        <ReticleIcon
                          className={`mt-0.5 size-4 shrink-0 ${
                            checked ? "text-atlas-star" : "text-atlas-line"
                          }`}
                        />
                        <span className="min-w-0">
                          <span
                            className={`block text-sm ${
                              checked
                                ? "text-atlas-dust font-semibold"
                                : "text-atlas-mist"
                            }`}
                          >
                            {info.label}
                          </span>
                          <span className="text-atlas-fog mt-0.5 block text-sm leading-snug">
                            {info.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <FormField label="Caduca (opcional)">
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, expiresAt: e.target.value }))
                    }
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Motivo" required>
                  <input
                    type="text"
                    value={form.reason}
                    maxLength={500}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    placeholder="Apoyo en la puerta del DevFest"
                    className={inputClass}
                  />
                </FormField>
              </div>

              {triedSubmit && missing.length > 0 && (
                <p role="alert" className="text-atlas-rose text-sm">
                  Falta {missing.join(", ")}.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {editing && (
                  <button
                    type="button"
                    className={buttonClass.quiet}
                    onClick={resetForm}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy !== null}
                  className={buttonClass.primary}
                >
                  {editing ? "Guardar cambios" : "Asignar"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="staff-list">
        <SectionHeading>
          <span id="staff-list">Quiénes trabajan este evento</span>
        </SectionHeading>
        {staff.length === 0 ? (
          <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-6 text-sm">
            Todavía no hay nadie asignado a este evento.
          </p>
        ) : (
          <ul className="border-atlas-line rounded-xs border">
            {staff.map((entry) => {
              const expires = toDate(entry.expiresAt);
              const legacy = entry.permissions === null;
              return (
                <li
                  key={entry.uid}
                  className={`border-atlas-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0 ${
                    entry.active ? "" : "opacity-60"
                  }`}
                >
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="text-atlas-dust font-semibold">
                      {named(entry.uid)}
                    </p>
                    <p className="text-atlas-fog text-sm">
                      {ROLE_LABELS[entry.role as Role] ?? entry.role} ·{" "}
                      {expires
                        ? `hasta el ${expires.toLocaleDateString("es-PE")}`
                        : "sin caducidad"}
                      {entry.reason && ` · ${entry.reason}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(entry.capabilities ?? []).map((cap) => (
                        <Tag key={cap}>
                          {STAFF_CAPABILITY_LABELS[cap].label}
                        </Tag>
                      ))}
                      {legacy && (
                        <Tag
                          tone="border-atlas-glow/50 text-atlas-glow"
                          title="Asignada antes de que existieran las capacidades: conserva lo que tenía entonces. Edítala para elegir qué puede hacer."
                        >
                          Asignación anterior
                        </Tag>
                      )}
                    </div>
                  </div>
                  <Tag
                    tone={
                      entry.active
                        ? "border-atlas-ok/50 text-atlas-ok"
                        : "border-atlas-line text-atlas-fog"
                    }
                  >
                    {entry.active ? "Activa" : "Caducada"}
                  </Tag>
                  {canAssign && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditing(entry)}
                        disabled={busy === entry.uid}
                        className={buttonClass.quiet}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(entry)}
                        disabled={busy === entry.uid}
                        className={`${buttonClass.quiet} hover:text-atlas-rose`}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

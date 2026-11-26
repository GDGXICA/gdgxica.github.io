import type {
  CertificateItem,
  CertificateKind,
  CertificatePersonInput,
  CertificatePersonPatch,
  CertificateSettings,
  EventCertificates,
  ManualCertificatesInput,
} from "./api";

// Dev-preview twin of the certificate endpoints: a small in-memory event
// whose queue "sends" each certificate a few seconds after it is queued,
// so the panel's polling and status changes can be seen without Firebase.

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data });
}

function fail(error: string, extra: Record<string, unknown> = {}) {
  return Promise.resolve({ success: false as const, error, ...extra });
}

const now = () => Date.now();

function item(
  over: Partial<CertificateItem> & Pick<CertificateItem, "id" | "kind">
): CertificateItem {
  return {
    source: "registered",
    rosterId: null,
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    hours: null,
    status: "pending",
    attempts: 0,
    lastError: null,
    sentAt: null,
    queuedAt: null,
    updatedAt: now(),
    resendCount: 0,
    overridden: false,
    eventRef: null,
    content: null,
    ...over,
  };
}

const ATTENDEES: [string, string, string, CertificateItem["checkin"]][] = [
  ["María José", "Ñahui Quispe", "maria.nahui@example.com", "panel"],
  ["Luis", "Paz Rojas", "luis.paz@example.com", "both"],
  ["Ana Lucía", "Torres", "ana.torres@example.com", "bevy"],
  ["Carlos", "Huamaní", "carlos.h@example.com", "panel"],
  ["Rosa", "Medina Cárdenas", "rosa.medina@example.com", "panel"],
  ["Jorge", "Villavicencio", "jorge.v@example.com", "bevy"],
];

const store = new Map<
  string,
  {
    settings: CertificateSettings | null;
    saved: boolean;
    items: CertificateItem[];
  }
>();

function eventStore(slug: string) {
  let s = store.get(slug);
  if (!s) {
    s = {
      settings: {
        eventName: "DevFest Ica 2026",
        eventDate: "2026-11-28",
        startTime: "09:00",
        endTime: "18:00",
        hours: 9,
      },
      saved: false,
      items: [
        ...ATTENDEES.map(([firstName, lastName, email, checkin], i) =>
          item({
            id: `att-${i}`,
            kind: "attendee",
            source: "roster",
            rosterId: `t_${1000 + i}`,
            firstName,
            lastName,
            name: `${firstName} ${lastName}`,
            email,
            checkin,
            ...(i === 1 ? { status: "sent", sentAt: now() - 3_600_000 } : {}),
            ...(i === 3
              ? {
                  status: "failed",
                  attempts: 6,
                  lastError: "550 5.1.1 The email account does not exist.",
                }
              : {}),
          })
        ),
        item({
          id: "vol-0",
          kind: "volunteer",
          firstName: "Diego",
          lastName: "Salas",
          name: "Diego Salas",
          email: "diego.salas@example.com",
          hours: 12,
        }),
        item({
          id: "spk-0",
          kind: "speaker",
          firstName: "Valeria",
          lastName: "Ccori",
          name: "Valeria Ccori",
          email: "valeria@example.com",
        }),
      ],
    };
    store.set(slug, s);
  }
  return s;
}

const manual: CertificateItem[] = [];

// Fake drain: whatever is queued is "sent" a few seconds later.
function drainSoon(items: CertificateItem[]) {
  setTimeout(() => {
    for (const it of items) {
      if (it.status !== "queued") continue;
      it.status = "sent";
      it.sentAt = now();
      it.attempts += 1;
      it.updatedAt = now();
    }
  }, 4000);
}

export const mockCertificates = {
  getEventCertificates: (slug: string) => {
    const s = eventStore(slug);
    const data: EventCertificates = {
      serverTime: now(),
      settings: s.settings,
      settingsSaved: s.saved,
      attendees: s.items.filter((i) => i.kind === "attendee"),
      people: s.items.filter((i) => i.kind !== "attendee"),
      roster: { total: 9, lastImportAt: now() - 7_200_000, checkedIn: 6 },
      budget: { sentToday: 41, cap: 350, transport: "gmail" as const },
    };
    return ok(structuredClone(data));
  },
  pollEventCertificates: (slug: string, since: number) =>
    ok({
      serverTime: now(),
      changes: structuredClone(
        eventStore(slug).items.filter((i) => (i.updatedAt ?? 0) > since)
      ),
    }),
  getCertificateSettings: (slug: string) => {
    const s = eventStore(slug);
    return ok({ settings: s.settings, settingsSaved: s.saved });
  },
  saveCertificateSettings: (slug: string, settings: CertificateSettings) => {
    const s = eventStore(slug);
    s.settings = settings;
    s.saved = true;
    return ok({ settings, settingsSaved: true });
  },
  addCertificatePeople: (
    slug: string,
    kind: "volunteer" | "speaker",
    people: CertificatePersonInput[]
  ) => {
    const s = eventStore(slug);
    const added: CertificateItem[] = [];
    const skipped: { email: string; reason: string }[] = [];
    for (const p of people) {
      const email = p.email.trim().toLowerCase();
      if (s.items.some((i) => i.kind === kind && i.email === email)) {
        skipped.push({ email, reason: "duplicate" });
        continue;
      }
      const it = item({
        id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        firstName: p.firstName,
        lastName: p.lastName,
        name: `${p.firstName} ${p.lastName}`.trim(),
        email,
        hours: p.hours ?? null,
      });
      s.items.push(it);
      added.push(it);
    }
    return ok(structuredClone({ added, skipped }));
  },
  updateCertificatePerson: (
    slug: string,
    id: string,
    patch: CertificatePersonPatch
  ) => {
    const it = eventStore(slug).items.find((i) => i.id === id);
    if (!it) return fail("Certificado no encontrado");
    if (patch.firstName !== undefined) it.firstName = patch.firstName;
    if (patch.lastName !== undefined) it.lastName = patch.lastName;
    if (patch.email !== undefined) it.email = patch.email.toLowerCase();
    if (patch.hours !== undefined) it.hours = patch.hours;
    if (patch.excluded === true) it.status = "excluded";
    if (patch.excluded === false && it.status === "excluded")
      it.status = "pending";
    it.name = `${it.firstName} ${it.lastName}`.trim();
    it.overridden = it.kind === "attendee";
    it.updatedAt = now();
    return ok({ certificate: structuredClone(it), previousId: null });
  },
  removeCertificatePerson: (slug: string, id: string) => {
    const s = eventStore(slug);
    s.items = s.items.filter((i) => i.id !== id);
    return ok({ id });
  },
  enqueueCertificates: (
    slug: string,
    body: { kind: CertificateKind; ids: string[]; resend?: boolean }
  ) => {
    const s = eventStore(slug);
    if (!s.saved) {
      return fail("Guarda los datos del certificado antes de enviar.", {
        missing: [],
      });
    }
    const queued: CertificateItem[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of body.ids) {
      const it = s.items.find((i) =>
        body.kind === "attendee" ? i.rosterId === id : i.id === id
      );
      if (!it) skipped.push({ id, reason: "not_found" });
      else if (it.status === "sent" && !body.resend)
        skipped.push({ id, reason: "already_sent" });
      else if (it.status === "queued" || it.status === "sending")
        skipped.push({ id, reason: "already_queued" });
      else if (it.status === "excluded")
        skipped.push({ id, reason: "excluded" });
      else {
        if (it.status === "sent") it.resendCount += 1;
        it.status = "queued";
        it.attempts = 0;
        it.lastError = null;
        it.queuedAt = now();
        it.updatedAt = now();
        queued.push(it);
      }
    }
    drainSoon(queued);
    return ok({ queued: queued.length, skipped });
  },
  cancelCertificates: (slug: string, ids: string[]) => {
    let cancelled = 0;
    for (const it of eventStore(slug).items) {
      if (ids.includes(it.id) && it.status === "queued") {
        it.status = "pending";
        it.updatedAt = now();
        cancelled++;
      }
    }
    return ok({ cancelled, skipped: [] });
  },
  previewCertificate: () =>
    // A one-page blank PDF is enough to exercise "open in a new tab".
    ok({
      pdfBase64:
        "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA4NDIgNTk1XT4+CmVuZG9iagp0cmFpbGVyCjw8L1Jvb3QgMSAwIFI+PgolJUVPRgo=",
    }),
  listManualCertificates: () =>
    ok({ serverTime: now(), items: structuredClone(manual) }),
  createManualCertificates: (body: ManualCertificatesInput) => {
    const added = body.recipients.map((r, i) =>
      item({
        id: `${body.submissionId}-${i}`,
        kind: body.kind,
        source: "manual",
        firstName: r.firstName,
        lastName: r.lastName,
        name: `${r.firstName} ${r.lastName}`.trim(),
        email: r.email.toLowerCase(),
        status: "queued",
        queuedAt: now(),
        eventRef: body.eventSlug,
        content: body.content,
      })
    );
    const fresh = added.filter((a) => !manual.some((m) => m.id === a.id));
    manual.unshift(...fresh);
    drainSoon(fresh);
    return ok({
      queued: fresh.length,
      existing: added.length - fresh.length,
      duplicates: 0,
    });
  },
};

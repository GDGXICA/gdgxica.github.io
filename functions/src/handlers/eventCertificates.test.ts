import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  audit: vi.fn(),
  enqueueTask: vi.fn(),
  githubFile: vi.fn(),
}));

vi.mock("firebase-admin", async () => {
  const fake = await import("../testing/fakeFirestore");
  return { firestore: () => fake.currentDb };
});
vi.mock("firebase-admin/firestore", async () => {
  const fake = await import("../testing/fakeFirestore");
  return { FieldValue: fake.FakeFieldValue, Timestamp: fake.FakeTimestamp };
});
vi.mock("firebase-admin/functions", () => ({
  getFunctions: () => ({ taskQueue: () => ({ enqueue: h.enqueueTask }) }),
}));
vi.mock("firebase-functions", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => "" }),
}));
vi.mock("../utils/audit", () => ({ writeAuditLog: h.audit }));
vi.mock("../services/emailSettings", () => ({
  readEmailTransport: async () => "gmail",
}));
vi.mock("../services/github", () => ({
  GitHubService: class {
    getFileContentIfExists = h.githubFile;
  },
}));

import { resetFakeFirestore, FakeTimestamp } from "../testing/fakeFirestore";
import type { FakeFirestore } from "../testing/fakeFirestore";
import {
  addCertificatePeople,
  cancelCertificates,
  createManualCertificates,
  enqueueCertificates,
  getEventCertificates,
  previewCertificate,
  removeCertificatePerson,
  saveCertificateSettings,
  updateCertificatePerson,
} from "./eventCertificates";
import {
  certificateCancelSchema,
  certificateEnqueueSchema,
  certificateManualSchema,
  certificatePeopleCreateSchema,
  certificatePersonUpdateSchema,
  certificatePreviewSchema,
  certificateSettingsSchema,
} from "../schemas";
import {
  attendeeCertificateId,
  personCertificateId,
} from "../services/certificateRecords";

const SLUG = "devfest-2026";
const SETTINGS = {
  eventName: "DevFest Ica 2026",
  eventDate: "2026-11-28",
  startTime: "09:00",
  endTime: "18:00",
  hours: 9,
};

// Response payloads vary per handler; tests read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

interface Res {
  statusCode: number;
  body: { success: boolean; data?: Loose; error?: string; missing?: string[] };
}

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  {
    params = {},
    body,
    query = {},
  }: { params?: object; body?: unknown; query?: object } = {}
): Promise<Res> {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  await handler(
    {
      params: { slug: SLUG, ...params },
      body,
      query,
      user: { uid: "org-1" },
    } as unknown as Request,
    res as unknown as Response
  );
  return res as Res;
}

let db: FakeFirestore;

function seedRoster(id: string, data: Record<string, unknown>) {
  db.seed(`events/${SLUG}/roster/${id}`, {
    firstName: "Ana",
    lastName: "Torres",
    email: "ana@mail.com",
    ...data,
  });
}

async function saveSettings(over: Partial<typeof SETTINGS> = {}) {
  const res = await call(saveCertificateSettings, {
    body: certificateSettingsSchema.parse({ ...SETTINGS, ...over }),
  });
  expect(res.statusCode).toBe(200);
}

const enqueue = (body: unknown) =>
  call(enqueueCertificates, { body: certificateEnqueueSchema.parse(body) });

const cert = (id: string) => db.get(`certificates/${id}`);

beforeEach(() => {
  db = resetFakeFirestore();
  h.audit.mockReset();
  h.enqueueTask.mockReset();
  h.githubFile.mockReset();
  h.githubFile.mockResolvedValue({
    data: {
      title: "DevFest Ica 2026",
      date: "2026-11-28T09:00:00",
      end_time: "06:00 PM",
    },
    sha: "x",
  });
});

describe("getEventCertificates", () => {
  it("lists only attendees with a check-in, from the panel or Bevy", async () => {
    seedRoster("t_panel", { checkedIn: true, bevyCheckinAt: null });
    seedRoster("t_bevy", {
      firstName: "LUIS",
      lastName: "QUISPE",
      email: "luis@mail.com",
      bevyCheckinAt: FakeTimestamp.fromMillis(1),
    });
    seedRoster("t_both", {
      email: "both@mail.com",
      checkedIn: true,
      bevyCheckinAt: FakeTimestamp.fromMillis(1),
    });
    seedRoster("t_none", { email: "none@mail.com", checkedIn: false });

    const res = await call(getEventCertificates);
    expect(res.statusCode).toBe(200);
    const { attendees, settings, settingsSaved, budget, roster } =
      res.body.data;
    const byRoster = Object.fromEntries(
      attendees.map((a: Loose) => [a.rosterId, a])
    );
    expect(Object.keys(byRoster).sort()).toEqual([
      "t_bevy",
      "t_both",
      "t_panel",
    ]);
    expect(byRoster.t_panel.checkin).toBe("panel");
    expect(byRoster.t_bevy.checkin).toBe("bevy");
    expect(byRoster.t_both.checkin).toBe("both");
    expect(byRoster.t_bevy.name).toBe("Luis Quispe");
    expect(byRoster.t_panel.id).toBe(attendeeCertificateId(SLUG, "t_panel"));
    expect(byRoster.t_panel.status).toBe("pending");
    expect(roster.checkedIn).toBe(3);
    // Derived from the event until the organizer saves them.
    expect(settingsSaved).toBe(false);
    expect(settings).toEqual(SETTINGS);
    expect(budget).toEqual({ sentToday: 0, cap: 350, transport: "gmail" });
  });

  it("returns only what changed when polled with since", async () => {
    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    const before = Date.now() - 1;
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    const res = await call(getEventCertificates, {
      query: { since: String(before) },
    });
    expect(res.body.data.changes).toHaveLength(1);
    expect(res.body.data.changes[0].status).toBe("queued");
    const later = await call(getEventCertificates, {
      query: { since: String(Date.now() + 1000) },
    });
    expect(later.body.data.changes).toEqual([]);
  });
});

describe("enqueueCertificates", () => {
  it("refuses to send before the settings are saved", async () => {
    seedRoster("t_panel", { checkedIn: true });
    const res = await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(res.statusCode).toBe(409);
    expect(cert(attendeeCertificateId(SLUG, "t_panel"))).toBeUndefined();
  });

  it("queues checked-in attendees and never anyone without a check-in", async () => {
    seedRoster("t_panel", {
      firstName: "MARÍA JOSÉ",
      lastName: "ÑAHUI",
      checkedIn: true,
    });
    seedRoster("t_bevy", {
      email: "bevy@mail.com",
      bevyCheckinAt: FakeTimestamp.fromMillis(1),
    });
    seedRoster("t_none", { email: "none@mail.com", checkedIn: false });
    await saveSettings();

    const res = await enqueue({
      kind: "attendee",
      ids: ["t_panel", "t_bevy", "t_none", "t_ghost"],
    });
    expect(res.body.data.queued).toBe(2);
    expect(res.body.data.skipped).toEqual([
      { id: "t_none", reason: "no_checkin" },
      { id: "t_ghost", reason: "not_found" },
    ]);
    expect(cert(attendeeCertificateId(SLUG, "t_none"))).toBeUndefined();
    expect(cert(attendeeCertificateId(SLUG, "t_panel"))).toMatchObject({
      status: "queued",
      kind: "attendee",
      source: "roster",
      eventSlug: SLUG,
      name: "María José Ñahui",
      email: "ana@mail.com",
      attempts: 0,
    });
    expect(h.enqueueTask).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "certificate.enqueue",
        targetId: SLUG,
        details: expect.objectContaining({ queued: 2, skipped: 2 }),
      }),
      expect.anything()
    );
  });

  it("does nothing on a double click", async () => {
    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    const again = await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(again.body.data).toEqual({
      queued: 0,
      skipped: [{ id: "t_panel", reason: "already_queued" }],
    });
    expect(h.enqueueTask).toHaveBeenCalledTimes(1);
  });

  it("only re-sends a sent certificate when asked to", async () => {
    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    const id = attendeeCertificateId(SLUG, "t_panel");
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    db.write(`certificates/${id}`, { status: "sent" }, "merge");

    const plain = await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(plain.body.data.skipped).toEqual([
      { id: "t_panel", reason: "already_sent" },
    ]);
    const resend = await enqueue({
      kind: "attendee",
      ids: ["t_panel"],
      resend: true,
    });
    expect(resend.body.data.queued).toBe(1);
    expect(cert(id)).toMatchObject({ status: "queued", resendCount: 1 });
  });

  it("puts a failed certificate back in the queue with fresh attempts", async () => {
    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    const id = attendeeCertificateId(SLUG, "t_panel");
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    db.write(`certificates/${id}`, { status: "failed", attempts: 6 }, "merge");
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(cert(id)).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("sends once to the same person registered on two tickets", async () => {
    seedRoster("t_1", { checkedIn: true });
    seedRoster("t_2", { checkedIn: true });
    // Same email, different person: both get one.
    seedRoster("t_3", { firstName: "Luis", checkedIn: true });
    await saveSettings();
    const res = await enqueue({ kind: "attendee", ids: ["t_1", "t_2", "t_3"] });
    expect(res.body.data.queued).toBe(2);
    expect(res.body.data.skipped).toEqual([{ id: "t_2", reason: "duplicate" }]);
  });

  it("does not require hours for speakers", async () => {
    await saveSettings({ hours: 0 });
    await call(addCertificatePeople, {
      body: certificatePeopleCreateSchema.parse({
        kind: "speaker",
        people: [{ firstName: "Ana", lastName: "Ruiz", email: "a@x.com" }],
      }),
    });
    const id = personCertificateId(SLUG, "speaker", "a@x.com");
    const speaker = await enqueue({ kind: "speaker", ids: [id] });
    expect(speaker.body.data.queued).toBe(1);

    seedRoster("t_panel", { checkedIn: true });
    const attendee = await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(attendee.statusCode).toBe(409);
    expect(attendee.body.missing).toEqual(["hours"]);
  });

  it("does not queue a certificate of another event or kind", async () => {
    await saveSettings();
    const id = personCertificateId("other-event", "volunteer", "a@x.com");
    db.seed(`certificates/${id}`, {
      eventSlug: "other-event",
      kind: "volunteer",
      status: "pending",
    });
    const res = await enqueue({ kind: "volunteer", ids: [id] });
    expect(res.body.data.skipped).toEqual([{ id, reason: "not_found" }]);
  });
});

describe("volunteers and speakers", () => {
  const add = (people: unknown[]) =>
    call(addCertificatePeople, {
      body: certificatePeopleCreateSchema.parse({ kind: "volunteer", people }),
    });

  it("registers people once per email", async () => {
    const res = await add([
      { firstName: "ana", lastName: "ruiz", email: "Ana@X.com", hours: 12 },
      { firstName: "Ana", lastName: "Ruiz", email: "ana@x.com" },
    ]);
    expect(res.body.data.added).toHaveLength(1);
    expect(res.body.data.skipped).toEqual([
      { email: "ana@x.com", reason: "duplicate" },
    ]);
    const again = await add([
      { firstName: "Ana", lastName: "Ruiz", email: "ana@x.com" },
    ]);
    expect(again.body.data.added).toHaveLength(0);
    expect(
      cert(personCertificateId(SLUG, "volunteer", "ana@x.com"))
    ).toMatchObject({
      name: "Ana Ruiz",
      email: "ana@x.com",
      hours: 12,
      status: "pending",
      source: "registered",
    });
  });

  it("moves the document when the email changes, and refuses a clash", async () => {
    await add([
      { firstName: "Ana", lastName: "Ruiz", email: "ana@x.com" },
      { firstName: "Luis", lastName: "Paz", email: "luis@x.com" },
    ]);
    const oldId = personCertificateId(SLUG, "volunteer", "ana@x.com");
    const update = (id: string, body: unknown) =>
      call(updateCertificatePerson, {
        params: { id },
        body: certificatePersonUpdateSchema.parse(body),
      });

    const moved = await update(oldId, { email: "ana.ruiz@x.com" });
    const newId = personCertificateId(SLUG, "volunteer", "ana.ruiz@x.com");
    expect(moved.body.data.certificate.id).toBe(newId);
    expect(moved.body.data.previousId).toBe(oldId);
    expect(cert(oldId)).toBeUndefined();
    expect(cert(newId)).toMatchObject({ email: "ana.ruiz@x.com" });

    const clash = await update(newId, { email: "luis@x.com" });
    expect(clash.statusCode).toBe(409);
  });

  it("refuses to remove a sent certificate or an attendee", async () => {
    await add([{ firstName: "Ana", lastName: "Ruiz", email: "ana@x.com" }]);
    const id = personCertificateId(SLUG, "volunteer", "ana@x.com");
    db.write(`certificates/${id}`, { status: "sent" }, "merge");
    const sent = await call(removeCertificatePerson, { params: { id } });
    expect(sent.statusCode).toBe(409);

    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    const attendee = await call(removeCertificatePerson, {
      params: { id: attendeeCertificateId(SLUG, "t_panel") },
    });
    expect(attendee.statusCode).toBe(400);
  });

  it("removes a registered person who was never sent anything", async () => {
    await add([{ firstName: "Ana", lastName: "Ruiz", email: "ana@x.com" }]);
    const id = personCertificateId(SLUG, "volunteer", "ana@x.com");
    const res = await call(removeCertificatePerson, { params: { id } });
    expect(res.statusCode).toBe(200);
    expect(cert(id)).toBeUndefined();
  });
});

describe("updateCertificatePerson for attendees", () => {
  it("creates the document on first edit and keeps the correction", async () => {
    seedRoster("t_panel", { firstName: "ana", checkedIn: true });
    const id = attendeeCertificateId(SLUG, "t_panel");
    const res = await call(updateCertificatePerson, {
      params: { id },
      body: certificatePersonUpdateSchema.parse({
        rosterId: "t_panel",
        firstName: "Ana Lucía",
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(cert(id)).toMatchObject({
      name: "Ana Lucía Torres",
      overridden: true,
      status: "pending",
    });

    // The roster changes on a re-import; the correction stays.
    db.write(`events/${SLUG}/roster/t_panel`, { firstName: "ANA" }, "merge");
    await saveSettings();
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(cert(id)).toMatchObject({
      name: "Ana Lucía Torres",
      status: "queued",
    });
  });

  it("refuses an id that does not belong to the roster id", async () => {
    seedRoster("t_panel", { checkedIn: true });
    const res = await call(updateCertificatePerson, {
      params: { id: attendeeCertificateId(SLUG, "t_other") },
      body: certificatePersonUpdateSchema.parse({
        rosterId: "t_panel",
        excluded: true,
      }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("refuses a certificate of another event", async () => {
    db.seed("certificates/abc", {
      eventSlug: "other-event",
      kind: "volunteer",
      status: "pending",
    });
    const res = await call(updateCertificatePerson, {
      params: { id: "abc" },
      body: certificatePersonUpdateSchema.parse({ excluded: true }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("excludes and restores", async () => {
    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    const id = attendeeCertificateId(SLUG, "t_panel");
    const patch = (body: unknown) =>
      call(updateCertificatePerson, {
        params: { id },
        body: certificatePersonUpdateSchema.parse(body),
      });
    await patch({ rosterId: "t_panel", excluded: true });
    expect(cert(id)?.status).toBe("excluded");
    const skipped = await enqueue({ kind: "attendee", ids: ["t_panel"] });
    expect(skipped.body.data.skipped).toEqual([
      { id: "t_panel", reason: "excluded" },
    ]);
    await patch({ excluded: false });
    expect(cert(id)?.status).toBe("pending");
  });
});

describe("cancelCertificates", () => {
  it("takes queued certificates back out of the queue", async () => {
    seedRoster("t_panel", { checkedIn: true });
    await saveSettings();
    await enqueue({ kind: "attendee", ids: ["t_panel"] });
    const id = attendeeCertificateId(SLUG, "t_panel");
    const res = await call(cancelCertificates, {
      body: certificateCancelSchema.parse({ ids: [id] }),
    });
    expect(res.body.data.cancelled).toBe(1);
    expect(cert(id)?.status).toBe("pending");
  });
});

describe("manual certificates", () => {
  const body = {
    submissionId: "0f966bde-2e21-4ba9-a986-4471b0529170",
    kind: "volunteer",
    eventSlug: null,
    content: SETTINGS,
    recipients: [
      { firstName: "ANA", lastName: "RUIZ", email: "ana@x.com" },
      { firstName: "Luis", lastName: "Paz", email: "luis@x.com" },
    ],
  };

  it("queues each person once, however often the form is resubmitted", async () => {
    const first = await call(createManualCertificates, {
      body: certificateManualSchema.parse(body),
    });
    expect(first.body.data).toEqual({ queued: 2, existing: 0, duplicates: 0 });
    const retry = await call(createManualCertificates, {
      body: certificateManualSchema.parse(body),
    });
    expect(retry.body.data).toEqual({ queued: 0, existing: 2, duplicates: 0 });
    const docs = [...db.docs.entries()].filter(([p]) =>
      p.startsWith("certificates/")
    );
    expect(docs).toHaveLength(2);
    expect(docs[0][1]).toMatchObject({
      source: "manual",
      eventSlug: null,
      status: "queued",
      name: "Ana Ruiz",
      content: SETTINGS,
    });
  });

  it("refuses incomplete event data", async () => {
    const res = await call(createManualCertificates, {
      body: certificateManualSchema.parse({
        ...body,
        kind: "attendee",
        content: { ...SETTINGS, hours: 0 },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.missing).toEqual(["hours"]);
  });
});

describe("previewCertificate", () => {
  it("returns a PDF and keeps the name out of the audit log", async () => {
    const res = await call(previewCertificate, {
      body: certificatePreviewSchema.parse({
        kind: "speaker",
        name: "Ana Ruiz",
        content: SETTINGS,
      }),
    });
    const pdf = Buffer.from(res.body.data.pdfBase64, "base64");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(JSON.stringify(h.audit.mock.calls[0][0])).not.toContain("Ana Ruiz");
  });
});

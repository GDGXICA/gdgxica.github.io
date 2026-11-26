import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  audit: vi.fn(),
  send: vi.fn(),
  buildPdf: vi.fn(),
  transport: { value: "gmail" as "gmail" | "resend" },
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
  getFunctions: () => ({ taskQueue: () => ({ enqueue: vi.fn() }) }),
}));
vi.mock("firebase-functions", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => "" }),
}));
vi.mock("firebase-functions/v2/tasks", () => ({
  onTaskDispatched: (_opts: unknown, fn: unknown) => fn,
}));
vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_opts: unknown, fn: unknown) => fn,
}));
vi.mock("../utils/audit", () => ({ writeAuditLog: h.audit }));
vi.mock("../services/emailSettings", () => ({
  readEmailTransport: async () => h.transport.value,
}));
vi.mock("../services/certificateEmail", () => ({
  sendCertificateEmail: h.send,
}));
vi.mock("../services/certificatePdf", () => ({
  buildCertificatePdf: h.buildPdf,
}));

import {
  FakeTimestamp,
  resetFakeFirestore,
  setFakeNow,
  type FakeFirestore,
} from "../testing/fakeFirestore";
import {
  certificateDrainHasWork,
  runCertificateDrain,
} from "./drainCertificateEmails";
import { budgetDocId, MAX_ATTEMPTS } from "../services/credentialQueue";

const SLUG = "devfest-2026";
const NOW = new Date("2026-11-29T15:00:00Z");
const BUDGET = `credential_email_budget/${budgetDocId(NOW)}`;
const SETTINGS = {
  eventName: "DevFest Ica 2026",
  eventDate: "2026-11-28",
  startTime: "09:00",
  endTime: "18:00",
  hours: 9,
};

let db: FakeFirestore;

const past = FakeTimestamp.fromMillis(NOW.getTime() - 60_000);
const future = FakeTimestamp.fromMillis(NOW.getTime() + 60_000);

function seedAttendee(
  id: string,
  over: Record<string, unknown> = {},
  roster: Record<string, unknown> | null = { checkedIn: true }
) {
  if (roster) {
    db.seed(`events/${SLUG}/roster/t_${id}`, {
      firstName: "Ana",
      lastName: "Torres",
      email: "ana@mail.com",
      ...roster,
    });
  }
  db.seed(`certificates/${id}`, {
    eventSlug: SLUG,
    kind: "attendee",
    source: "roster",
    rosterId: `t_${id}`,
    firstName: "Ana",
    lastName: "Torres",
    name: "Ana Torres",
    email: "ana@mail.com",
    status: "queued",
    attempts: 0,
    nextAttemptAt: past,
    ...over,
  });
}

const run = () =>
  runCertificateDrain({
    db: db as never,
    now: () => NOW,
    sleep: async () => {},
  });

beforeEach(() => {
  db = resetFakeFirestore();
  setFakeNow(() => NOW.getTime());
  h.audit.mockReset();
  h.send.mockReset().mockResolvedValue(undefined);
  h.buildPdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  h.transport.value = "gmail";
  db.seed(`events/${SLUG}/certificateMeta/settings`, SETTINGS);
});

describe("runCertificateDrain", () => {
  it("sends a queued certificate and records what was printed", async () => {
    seedAttendee("a");
    const result = await run();

    expect(result).toMatchObject({ claimed: 1, sent: 1, retried: 0 });
    expect(h.buildPdf).toHaveBeenCalledWith({
      kind: "attendee",
      recipientName: "Ana Torres",
      eventName: "DevFest Ica 2026",
      eventDate: "2026-11-28",
      startTime: "9:00 a.m.",
      endTime: "6:00 p.m.",
      hours: 9,
    });
    expect(h.send).toHaveBeenCalledWith(
      "gmail",
      expect.objectContaining({ to: "ana@mail.com", kind: "attendee" })
    );
    expect(db.get("certificates/a")).toMatchObject({
      status: "sent",
      attempts: 1,
      lastError: null,
      nextAttemptAt: null,
      sentContent: { ...SETTINGS, name: "Ana Torres" },
    });
    expect(db.get(BUDGET)).toEqual({ sent: 1 });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "certificate_email.drain" })
    );
  });

  it("sends nothing once today's shared budget is used up", async () => {
    seedAttendee("a");
    db.seed(BUDGET, { sent: 350 });
    const result = await run();
    expect(result.budgetExhausted).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
    expect(db.get("certificates/a")?.status).toBe("queued");
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("uses Resend's smaller cap when Resend is the transport", async () => {
    h.transport.value = "resend";
    seedAttendee("a");
    db.seed(BUDGET, { sent: 90 });
    expect((await run()).budgetExhausted).toBe(true);
    db.seed(BUDGET, { sent: 89 });
    expect((await run()).sent).toBe(1);
    expect(h.send).toHaveBeenCalledWith("resend", expect.anything());
  });

  it("backs off after a failure and gives the budget slot back", async () => {
    seedAttendee("a");
    h.send.mockRejectedValueOnce(new Error("454 Too many login attempts"));
    const result = await run();
    expect(result.retried).toBe(1);
    const doc = db.get("certificates/a")!;
    expect(doc.status).toBe("queued");
    expect(doc.lastError).toBe("454 Too many login attempts");
    expect((doc.nextAttemptAt as FakeTimestamp).toMillis()).toBeGreaterThan(
      NOW.getTime()
    );
    expect(db.get(BUDGET)).toEqual({ sent: 0 });
  });

  it("parks a certificate as failed after the last attempt", async () => {
    seedAttendee("a", { attempts: MAX_ATTEMPTS - 1 });
    h.send.mockRejectedValueOnce(new Error("550 mailbox unavailable"));
    const result = await run();
    expect(result.failed).toBe(1);
    expect(db.get("certificates/a")).toMatchObject({
      status: "failed",
      nextAttemptAt: null,
    });
  });

  it("reclaims a certificate a crashed run left in sending", async () => {
    seedAttendee("stale", { status: "sending", nextAttemptAt: past });
    seedAttendee("live", { status: "sending", nextAttemptAt: future });
    const result = await run();
    expect(result.sent).toBe(1);
    expect(db.get("certificates/stale")?.status).toBe("sent");
    expect(db.get("certificates/live")?.status).toBe("sending");
  });

  it("cancels an attendee whose check-in was undone", async () => {
    seedAttendee("a", {}, { checkedIn: false, bevyCheckinAt: null });
    const result = await run();
    expect(result).toMatchObject({ cancelled: 1, sent: 0 });
    expect(h.send).not.toHaveBeenCalled();
    expect(db.get("certificates/a")?.status).toBe("cancelled");
    expect(db.get(BUDGET)).toBeUndefined();
  });

  it("still sends to someone checked in only on Bevy", async () => {
    seedAttendee(
      "a",
      {},
      { checkedIn: false, bevyCheckinAt: FakeTimestamp.fromMillis(1) }
    );
    expect((await run()).sent).toBe(1);
  });

  it("prints the roster's current name unless an organizer corrected it", async () => {
    seedAttendee("a", {}, { checkedIn: true, firstName: "ANA LUCÍA" });
    seedAttendee(
      "b",
      { name: "Luis Paz", email: "luis@mail.com", overridden: true },
      { checkedIn: true, firstName: "LUIS" }
    );
    await run();
    const names = h.send.mock.calls.map((c) => c[1].recipientName).sort();
    expect(names).toEqual(["Ana Lucía Torres", "Luis Paz"]);
  });

  it("uses a manual certificate's own event data", async () => {
    db.seed("certificates/m", {
      eventSlug: null,
      kind: "speaker",
      source: "manual",
      name: "Ana Ruiz",
      email: "ana@x.com",
      status: "queued",
      attempts: 0,
      nextAttemptAt: past,
      content: { ...SETTINGS, eventName: "Charla en la UNICA", hours: 0 },
    });
    await run();
    expect(h.buildPdf).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "Charla en la UNICA" })
    );
  });

  it("credits a volunteer's own hours", async () => {
    db.seed("certificates/v", {
      eventSlug: SLUG,
      kind: "volunteer",
      source: "registered",
      name: "Ana Ruiz",
      email: "ana@x.com",
      hours: 14,
      status: "queued",
      attempts: 0,
      nextAttemptAt: past,
    });
    await run();
    expect(h.buildPdf).toHaveBeenCalledWith(
      expect.objectContaining({ hours: 14 })
    );
  });

  it("retries, rather than sends, when the event has no settings", async () => {
    db.docs.delete(`events/${SLUG}/certificateMeta/settings`);
    seedAttendee("a");
    const result = await run();
    expect(result.retried).toBe(1);
    expect(h.send).not.toHaveBeenCalled();
    expect(db.get("certificates/a")?.lastError).toMatch(
      /Faltan datos del certificado/
    );
  });

  it("leaves no audit row when there was nothing to do", async () => {
    seedAttendee("a", { status: "sent", nextAttemptAt: null });
    expect(await run()).toMatchObject({ claimed: 0, sent: 0 });
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("certificateDrainHasWork", () => {
  it("is true only with something due and budget left", async () => {
    expect(await certificateDrainHasWork(db as never, NOW)).toBe(false);
    seedAttendee("a", { nextAttemptAt: future });
    expect(await certificateDrainHasWork(db as never, NOW)).toBe(false);
    seedAttendee("b");
    expect(await certificateDrainHasWork(db as never, NOW)).toBe(true);
    db.seed(BUDGET, { sent: 350 });
    expect(await certificateDrainHasWork(db as never, NOW)).toBe(false);
  });
});

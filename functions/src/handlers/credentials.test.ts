import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SERVER_TS = "__SERVER_TS__";

const mocks = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  runTransactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  saveCredentialImagesMock: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(
    () => ({
      collection: mocks.collectionMock,
      runTransaction: mocks.runTransactionMock,
    }),
    { FieldValue: { serverTimestamp: () => SERVER_TS } }
  ),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
}));

vi.mock("../utils/audit", () => ({
  writeAuditLog: mocks.writeAuditLogMock,
}));

vi.mock("../services/credentialStorage", async (importOriginal) => {
  // decodeJpegDataUrl is pure and worth exercising for real; only the
  // bucket write is stubbed.
  const actual =
    await importOriginal<typeof import("../services/credentialStorage")>();
  return { ...actual, saveCredentialImages: mocks.saveCredentialImagesMock };
});

import { createCredential } from "./credentials";
import type { AuthenticatedRequest } from "../middleware/auth";

const {
  collectionMock,
  runTransactionMock,
  writeAuditLogMock,
  saveCredentialImagesMock,
} = mocks;

// A real minimal JPEG: SOI + APP0 header. Enough for the magic-byte check.
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
]);
const JPEG_DATA_URL = `data:image/jpeg;base64,${JPEG_BYTES.toString("base64")}`;
const NOT_JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from(
  "<svg>not a jpeg at all</svg>"
).toString("base64")}`;

const VALID_BODY = {
  firstName: "Alvaro",
  lastName: "Pena",
  dni: "12345678",
  email: "alvaro@example.com",
  company: "Shinkansen",
  githubUsername: "aalvaropc",
  heardAbout: "redes_sociales",
  heardAboutOther: "",
  yearsExperience: "3_5",
  googleToolsLevel: "intermedia",
  consentGdgTerms: true,
  consentGooglePrivacy: true,
  consentCodeOfConduct: true,
  consentDataProcessing: true,
  consentAgeAttested: true,
  consentPolicyVersion: "2026-08-01",
  avatarKind: "mascot",
  mascotId: "gdg-blue-a",
  photoDataUrl: null,
  credentialImageDataUrl: null,
};

interface ResMock extends Response {
  __status: number | undefined;
  __body: unknown;
}

function buildRes(): ResMock {
  const res: Partial<ResMock> = {};
  res.status = vi.fn(function (this: ResMock, code: number) {
    this.__status = code;
    return this;
  }) as ResMock["status"];
  res.json = vi.fn(function (this: ResMock, body: unknown) {
    this.__body = body;
    return this;
  }) as ResMock["json"];
  return res as ResMock;
}

function buildReq(
  body: unknown,
  { userAgent = "Mozilla/5.0 (Test)" }: { userAgent?: string } = {}
): Request {
  const req = {
    body,
    params: { slug: "devfest-2026" },
    user: { uid: "anon-uid-1", role: "member" },
    get: (header: string) =>
      header.toLowerCase() === "user-agent" ? userAgent : undefined,
  } as unknown as AuthenticatedRequest;
  return req as unknown as Request;
}

/** Captured state of the fake Firestore for assertions. */
interface Harness {
  created: Record<string, unknown>[];
  counterWrites: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  credentialId: string;
}

/**
 * Wires a fake events/{slug} document tree.
 *
 * `counterValues` is consumed one entry per transaction attempt, so a test
 * can simulate a stale read followed by a retry.
 */
function setupFirestore(
  options: {
    groupLetters?: string[] | undefined;
    counterValues?: (number | undefined)[];
    attempts?: number;
  } = {}
): Harness {
  const harness: Harness = {
    created: [],
    counterWrites: [],
    updates: [],
    credentialId: "cred-abc123",
  };

  const counterValues = options.counterValues ?? [undefined];
  let attempt = 0;

  const credentialDoc = {
    id: harness.credentialId,
    update: vi.fn((data: Record<string, unknown>) => {
      harness.updates.push(data);
      return Promise.resolve();
    }),
  };

  const eventDoc = {
    get: vi.fn(() =>
      Promise.resolve({
        data: () => ({
          credential:
            options.groupLetters === undefined
              ? undefined
              : { enabled: true, group_letters: options.groupLetters },
        }),
      })
    ),
    collection: vi.fn((name: string) => {
      if (name === "credentialMeta") {
        return { doc: vi.fn(() => ({ __kind: "counter" })) };
      }
      return { doc: vi.fn(() => credentialDoc) };
    }),
  };

  collectionMock.mockImplementation(() => ({
    doc: vi.fn(() => eventDoc),
  }));

  runTransactionMock.mockImplementation(
    async (fn: (tx: unknown) => Promise<void>) => {
      const total = options.attempts ?? 1;
      for (let i = 0; i < total; i++) {
        const value =
          counterValues[Math.min(attempt, counterValues.length - 1)];
        attempt++;
        const tx = {
          get: vi.fn(() =>
            Promise.resolve({ data: () => ({ nextSequence: value }) })
          ),
          set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
            harness.counterWrites.push(data);
          }),
          create: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
            harness.created.push(data);
          }),
        };
        // Only the final attempt's writes count, mirroring how Firestore
        // discards the writes of a retried transaction.
        if (i === total - 1) {
          await fn(tx);
        } else {
          harness.created.length = 0;
          harness.counterWrites.length = 0;
          await fn(tx);
          harness.created.length = 0;
          harness.counterWrites.length = 0;
        }
      }
    }
  );

  return harness;
}

beforeEach(() => {
  vi.clearAllMocks();
  writeAuditLogMock.mockResolvedValue(undefined);
  saveCredentialImagesMock.mockResolvedValue({
    photoPath: null,
    credentialImagePath: null,
  });
});

describe("createCredential — sequence assignment", () => {
  it("assigns 1 to the first credential", async () => {
    const h = setupFirestore({ groupLetters: ["A", "Q", "I", "C"] });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(h.created[0].sequenceNumber).toBe(1);
    expect(h.counterWrites[0]).toEqual({ nextSequence: 1 });
    expect(res.__body).toMatchObject({
      success: true,
      data: { sequenceNumber: 1, groupLetter: "A" },
    });
  });

  it("assigns the next number when the counter already exists", async () => {
    const h = setupFirestore({
      groupLetters: ["A", "Q", "I", "C"],
      counterValues: [7],
    });
    await createCredential(buildReq(VALID_BODY), buildRes());

    expect(h.created[0].sequenceNumber).toBe(8);
    expect(h.created[0].groupLetter).toBe("C");
  });

  it("produces no duplicate sequence when a stale read forces a retry", async () => {
    // Firestore discards a retried transaction's writes and re-runs the
    // callback. The credential must end up stamped with the sequence from
    // the FINAL attempt only.
    const h = setupFirestore({
      groupLetters: ["A", "Q"],
      counterValues: [3, 9],
      attempts: 2,
    });
    await createCredential(buildReq(VALID_BODY), buildRes());

    expect(h.created).toHaveLength(1);
    expect(h.created[0].sequenceNumber).toBe(10);
    expect(h.counterWrites).toEqual([{ nextSequence: 10 }]);
  });

  it("falls back to default letters when the event has no config", async () => {
    // A misconfigured event must not be able to reject a registration.
    const h = setupFirestore({ groupLetters: undefined });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(h.created[0].groupLetter).toBe("A");
    expect(res.__body).toMatchObject({ success: true });
  });

  it("falls back to default letters when the letter array is empty", async () => {
    const h = setupFirestore({ groupLetters: [] });
    await createCredential(buildReq(VALID_BODY), buildRes());
    expect(h.created[0].groupLetter).toBe("A");
  });
});

describe("createCredential — stored document", () => {
  it("stores the normalized DNI alongside the raw one", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(
      buildReq({ ...VALID_BODY, dni: "12345678" }),
      buildRes()
    );

    expect(h.created[0].dni).toBe("12345678");
    expect(h.created[0].dniNormalized).toBe("12345678");
  });

  it("indexes the DNI and name into searchTokens", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(buildReq(VALID_BODY), buildRes());

    const tokens = h.created[0].searchTokens as string[];
    expect(tokens).toContain("12345678");
    expect(tokens).toContain("alvaro");
    expect(tokens).toContain("aalvaropc");
  });

  it("takes consentUserAgent from the header, not the body", async () => {
    // A consent record whose provenance the client supplied is worthless.
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(
      buildReq(
        { ...VALID_BODY, consentUserAgent: "spoofed-by-client" },
        { userAgent: "RealBrowser/1.0" }
      ),
      buildRes()
    );

    expect(h.created[0].consentUserAgent).toBe("RealBrowser/1.0");
  });

  it("collapses a multi-line user agent to one bounded line", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(
      buildReq(VALID_BODY, {
        userAgent: `Evil\r\nX-Injected: 1${"x".repeat(400)}`,
      }),
      buildRes()
    );

    const ua = h.created[0].consentUserAgent as string;
    expect(ua).not.toContain("\n");
    expect(ua).not.toContain("\r");
    expect(ua.length).toBeLessThanOrEqual(200);
  });

  it("starts the record queued for email and pending for Bevy", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(buildReq(VALID_BODY), buildRes());

    expect(h.created[0].emailStatus).toBe("queued");
    expect(h.created[0].emailAttempts).toBe(0);
    expect(h.created[0].bevyStatus).toBe("pending");
  });

  it("records the anonymous uid for forensics", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(buildReq(VALID_BODY), buildRes());
    expect(h.created[0].createdByUid).toBe("anon-uid-1");
  });
});

describe("createCredential — photos", () => {
  it("sets photoStatus none and writes nothing to storage without a photo", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(buildReq(VALID_BODY), buildRes());

    expect(h.created[0].photoStatus).toBe("none");
    expect(h.created[0].photoBytes).toBeNull();
    expect(saveCredentialImagesMock).not.toHaveBeenCalled();
  });

  it("queues a supplied photo for review and uploads it", async () => {
    saveCredentialImagesMock.mockResolvedValue({
      photoPath: "credentials/devfest-2026/cred-abc123/photo.jpg",
      credentialImagePath:
        "credentials/devfest-2026/cred-abc123/credential.jpg",
    });
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(
      buildReq({
        ...VALID_BODY,
        avatarKind: "photo",
        mascotId: null,
        photoDataUrl: JPEG_DATA_URL,
        credentialImageDataUrl: JPEG_DATA_URL,
      }),
      buildRes()
    );

    expect(h.created[0].photoStatus).toBe("pending_review");
    expect(h.created[0].photoBytes).toBe(JPEG_BYTES.length);

    const [slug, credentialId, images] = saveCredentialImagesMock.mock.calls[0];
    expect(slug).toBe("devfest-2026");
    expect(credentialId).toBe("cred-abc123");
    expect(images.photo).toBeInstanceOf(Buffer);

    // Paths are written after the transaction, since Storage is not
    // transactional and a failed upload must not lose the registration.
    expect(h.updates[0]).toMatchObject({
      photoPath: "credentials/devfest-2026/cred-abc123/photo.jpg",
    });
  });

  it("rejects a payload whose bytes are not really a JPEG", async () => {
    // The MIME prefix is attacker-controlled text; the magic bytes are the
    // payload itself.
    setupFirestore({ groupLetters: ["A"] });
    const res = buildRes();
    await createCredential(
      buildReq({
        ...VALID_BODY,
        avatarKind: "photo",
        mascotId: null,
        photoDataUrl: NOT_JPEG_DATA_URL,
      }),
      res
    );

    expect(res.__status).toBe(400);
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it("does not burn a sequence number on a rejected photo", async () => {
    const h = setupFirestore({ groupLetters: ["A"] });
    await createCredential(
      buildReq({
        ...VALID_BODY,
        avatarKind: "photo",
        mascotId: null,
        photoDataUrl: NOT_JPEG_DATA_URL,
      }),
      buildRes()
    );
    expect(h.counterWrites).toHaveLength(0);
  });

  it("keeps the record when the upload fails", async () => {
    saveCredentialImagesMock.mockResolvedValue({
      photoPath: null,
      credentialImagePath: null,
    });
    const h = setupFirestore({ groupLetters: ["A"] });
    const res = buildRes();
    await createCredential(
      buildReq({
        ...VALID_BODY,
        avatarKind: "photo",
        mascotId: null,
        photoDataUrl: JPEG_DATA_URL,
      }),
      res
    );

    // The registration is what matters to the attendee; a lost image is
    // recoverable, a lost registration is not.
    expect(res.__body).toMatchObject({ success: true });
    expect(h.updates).toHaveLength(0);
  });
});

describe("createCredential — audit", () => {
  it("logs the create without any personal data in the details", async () => {
    setupFirestore({ groupLetters: ["A", "Q"] });
    await createCredential(buildReq(VALID_BODY), buildRes());

    const entry = writeAuditLogMock.mock.calls[0][0];
    expect(entry.action).toBe("credential.create");
    expect(entry.targetId).toBe("cred-abc123");

    // audit_log is read by a different set of eyes than the credentials
    // collection; the document id is enough to trace the record.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("alvaro@example.com");
    expect(serialized).not.toContain("Alvaro");
  });
});

describe("createCredential — failures", () => {
  it("returns a scrubbed 500 when the transaction throws", async () => {
    setupFirestore({ groupLetters: ["A"] });
    runTransactionMock.mockRejectedValue(
      new Error("secret internals at https://firestore.googleapis.com/x")
    );
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(res.__status).toBe(500);
    expect(JSON.stringify(res.__body)).not.toContain("googleapis");
  });
});

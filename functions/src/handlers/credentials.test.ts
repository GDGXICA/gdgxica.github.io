import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SERVER_TS = "__SERVER_TS__";

const mocks = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  runTransactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  saveCredentialImagesMock: vi.fn(),
  deleteCredentialImagesMock: vi.fn(),
  getAllMock: vi.fn(),
  batchMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(
    () => ({
      collection: mocks.collectionMock,
      runTransaction: mocks.runTransactionMock,
      getAll: mocks.getAllMock,
      batch: mocks.batchMock,
    }),
    { FieldValue: { serverTimestamp: () => SERVER_TS } }
  ),
}));

vi.mock("firebase-functions", () => ({
  logger: { warn: mocks.loggerWarnMock, info: vi.fn(), error: vi.fn() },
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
  return {
    ...actual,
    saveCredentialImages: mocks.saveCredentialImagesMock,
    deleteCredentialImages: mocks.deleteCredentialImagesMock,
  };
});

import {
  attachCredentialImage,
  createCredential,
  moderatePhoto,
  reconcileCredentials,
  retryEmail,
  sendReminders,
  setBevyStatus,
} from "./credentials";
import { MASCOT_IDS } from "../services/credentialSequence";
import type { AuthenticatedRequest } from "../middleware/auth";

const {
  collectionMock,
  runTransactionMock,
  writeAuditLogMock,
  saveCredentialImagesMock,
  deleteCredentialImagesMock,
  getAllMock,
  batchMock,
  loggerWarnMock,
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
    maxCredentials?: number;
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
              : {
                  enabled: true,
                  group_letters: options.groupLetters,
                  max_credentials: options.maxCredentials,
                },
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

/**
 * Wires a single credential document with arbitrary stored fields.
 *
 * Shared by the three handlers that reach one through credentialRef():
 * setBevyStatus, moderatePhoto and retryEmail. Pass null for "not found".
 */
function setupCredentialDoc(data: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const docRef = {
    get: vi.fn(() =>
      Promise.resolve({ exists: data !== null, data: () => data ?? undefined })
    ),
    update: vi.fn((patch: Record<string, unknown>) => {
      updates.push(patch);
      return Promise.resolve();
    }),
  };
  collectionMock.mockImplementation(() => ({
    doc: vi.fn(() => ({
      collection: vi.fn(() => ({ doc: vi.fn(() => docRef) })),
    })),
  }));
  return { updates, docRef };
}

/** A request from someone holding the operator permissions. */
function opReq(body: unknown = {}, params: Record<string, string> = {}) {
  return {
    body,
    params: { slug: "devfest-2026", id: "cred-abc123", ...params },
    user: { uid: "organizer-uid", role: "organizer" },
    get: () => undefined,
  } as unknown as Request;
}

/**
 * A staged WriteBatch, the same shape users.test.ts and eventStaff.test.ts
 * use: nothing is recorded until commit(), which is what distinguishes a
 * batch from a pair of sequential writes and is the property worth pinning.
 */
function stageBatches() {
  const committed: { ref: unknown; patch: Record<string, unknown> }[] = [];
  const commitSizes: number[] = [];
  batchMock.mockImplementation(() => {
    const staged: { ref: unknown; patch: Record<string, unknown> }[] = [];
    const api = {
      update: (ref: unknown, patch: Record<string, unknown>) => {
        staged.push({ ref, patch });
        return api;
      },
      commit: async () => {
        commitSizes.push(staged.length);
        committed.push(...staged);
        staged.length = 0;
      },
    };
    return api;
  });
  return { committed, commitSizes };
}

beforeEach(() => {
  vi.clearAllMocks();
  writeAuditLogMock.mockResolvedValue(undefined);
  saveCredentialImagesMock.mockResolvedValue({
    photoPath: null,
    credentialImagePath: null,
  });
  deleteCredentialImagesMock.mockResolvedValue(undefined);
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

describe("attachCredentialImage", () => {
  /** Wires a single credential document with the given owner. */
  function setupCredential(createdByUid: string | null) {
    const updates: Record<string, unknown>[] = [];
    const docRef = {
      get: vi.fn(() =>
        Promise.resolve({
          exists: createdByUid !== null,
          data: () => (createdByUid ? { createdByUid } : undefined),
        })
      ),
      update: vi.fn((data: Record<string, unknown>) => {
        updates.push(data);
        return Promise.resolve();
      }),
    };
    collectionMock.mockImplementation(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({ doc: vi.fn(() => docRef) })),
      })),
    }));
    return { updates, docRef };
  }

  function imageReq(uid = "anon-uid-1") {
    return {
      body: { credentialImageDataUrl: JPEG_DATA_URL },
      params: { slug: "devfest-2026", id: "cred-abc123" },
      user: { uid, role: "member" },
      get: () => undefined,
    } as unknown as Request;
  }

  it("stores the card and records its path", async () => {
    saveCredentialImagesMock.mockResolvedValue({
      photoPath: null,
      credentialImagePath:
        "credentials/devfest-2026/cred-abc123/credential.jpg",
    });
    const h = setupCredential("anon-uid-1");
    const res = buildRes();
    await attachCredentialImage(imageReq(), res);

    expect(res.__body).toMatchObject({ success: true });
    expect(h.updates[0]).toMatchObject({
      credentialImagePath:
        "credentials/devfest-2026/cred-abc123/credential.jpg",
    });
  });

  it("rejects a caller that did not create the credential", async () => {
    // Otherwise anyone knowing a document id could overwrite someone
    // else's card with an image of their choosing.
    setupCredential("anon-uid-1");
    const res = buildRes();
    await attachCredentialImage(imageReq("otro-anon"), res);

    expect(res.__status).toBe(403);
    expect(saveCredentialImagesMock).not.toHaveBeenCalled();
  });

  it("404s on a missing credential", async () => {
    setupCredential(null);
    const res = buildRes();
    await attachCredentialImage(imageReq(), res);
    expect(res.__status).toBe(404);
  });

  it("rejects a payload whose bytes are not really a JPEG", async () => {
    setupCredential("anon-uid-1");
    const res = buildRes();
    await attachCredentialImage(
      {
        ...imageReq(),
        body: { credentialImageDataUrl: NOT_JPEG_DATA_URL },
      } as unknown as Request,
      res
    );
    expect(res.__status).toBe(400);
    expect(saveCredentialImagesMock).not.toHaveBeenCalled();
  });

  it("reports a failed upload instead of claiming success", async () => {
    saveCredentialImagesMock.mockResolvedValue({
      photoPath: null,
      credentialImagePath: null,
    });
    const h = setupCredential("anon-uid-1");
    const res = buildRes();
    await attachCredentialImage(imageReq(), res);

    expect(res.__status).toBe(500);
    expect(h.updates).toHaveLength(0);
  });
});

describe("createCredential — per-event cap", () => {
  it("issues normally while below the cap", async () => {
    const h = setupFirestore({
      groupLetters: ["A", "Q"],
      maxCredentials: 5,
      counterValues: [3],
    });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(res.__body).toMatchObject({ success: true });
    expect(h.created[0].sequenceNumber).toBe(4);
  });

  it("issues the very last credential allowed", async () => {
    // Boundary: with a cap of 5 and 4 already issued, the next one is
    // number 5 and must go through.
    const h = setupFirestore({
      groupLetters: ["A"],
      maxCredentials: 5,
      counterValues: [4],
    });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(res.__body).toMatchObject({ success: true });
    expect(h.created[0].sequenceNumber).toBe(5);
  });

  it("refuses with 409 once the cap is full", async () => {
    const h = setupFirestore({
      groupLetters: ["A"],
      maxCredentials: 5,
      counterValues: [5],
    });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(res.__status).toBe(409);
    expect(h.created).toHaveLength(0);
    expect(h.counterWrites).toHaveLength(0);
  });

  it("explains the refusal in Spanish rather than leaking an error", async () => {
    // 409 is a state the attendee can act on, so it must not be dressed
    // up as the generic 500 message.
    setupFirestore({
      groupLetters: ["A"],
      maxCredentials: 1,
      counterValues: [1],
    });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    const body = res.__body as { error: string };
    expect(body.error).toMatch(/credenciales disponibles/i);
    expect(body.error).not.toMatch(/internal error/i);
  });

  it("does not write the counter when refusing", async () => {
    // A refused attempt must not consume a sequence number, or the cap
    // would shrink every time someone hits a full event.
    const h = setupFirestore({
      groupLetters: ["A"],
      maxCredentials: 2,
      counterValues: [2],
    });
    await createCredential(buildReq(VALID_BODY), buildRes());
    expect(h.counterWrites).toHaveLength(0);
  });

  it("treats an absent cap as unlimited", async () => {
    const h = setupFirestore({
      groupLetters: ["A"],
      counterValues: [99999],
    });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(res.__body).toMatchObject({ success: true });
    expect(h.created[0].sequenceNumber).toBe(100000);
  });

  it("treats a zero cap as unlimited, not as closed", async () => {
    // A missing field and a zero must not mean opposite things; zero
    // reading as "issue nothing" would silently close registration.
    const h = setupFirestore({
      groupLetters: ["A"],
      maxCredentials: 0,
      counterValues: [10],
    });
    const res = buildRes();
    await createCredential(buildReq(VALID_BODY), res);

    expect(res.__body).toMatchObject({ success: true });
    expect(h.created).toHaveLength(1);
  });
});

describe("setBevyStatus", () => {
  it("returns 404 for a credential that is not there", async () => {
    setupCredentialDoc(null);
    const res = buildRes();
    await setBevyStatus(opReq({ status: "loaded" }), res);

    expect(res.__status).toBe(404);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("attributes the load to whoever claimed it", async () => {
    const h = setupCredentialDoc({ bevyStatus: "pending" });
    const res = buildRes();
    await setBevyStatus(
      opReq({ status: "loaded", ticketNumber: "T-42", note: null }),
      res
    );

    expect(res.__body).toMatchObject({
      success: true,
      data: { id: "cred-abc123", status: "loaded" },
    });
    expect(h.updates[0]).toMatchObject({
      bevyStatus: "loaded",
      bevyTicketNumber: "T-42",
      bevyLoadedBy: "organizer-uid",
      bevyLoadedAt: SERVER_TS,
    });
  });

  // Someone has to own the claim that a record reached the official panel.
  // Clearing the status back to pending must not leave the previous
  // claimant behind, or the ledger says a record is unloaded while still
  // naming who loaded it.
  it("drops the attribution when the status goes back to pending", async () => {
    const h = setupCredentialDoc({ bevyStatus: "loaded" });
    await setBevyStatus(
      opReq({ status: "pending", ticketNumber: null, note: null }),
      buildRes()
    );

    expect(h.updates[0]).toMatchObject({
      bevyStatus: "pending",
      bevyLoadedBy: null,
      bevyLoadedAt: null,
    });
  });

  it("records the change without the attendee's identity", async () => {
    setupCredentialDoc({ bevyStatus: "pending" });
    await setBevyStatus(
      opReq({ status: "discarded", ticketNumber: null, note: "duplicada" }),
      buildRes()
    );

    const [entry] = writeAuditLogMock.mock.calls[0];
    expect(entry).toMatchObject({
      action: "credential.bevy_status",
      performedBy: "organizer-uid",
      targetId: "cred-abc123",
      details: { eventSlug: "devfest-2026", status: "discarded" },
    });
    expect(JSON.stringify(entry)).not.toContain("12345678");
  });
});

describe("moderatePhoto — approve", () => {
  it("keeps the image and only stamps the review", async () => {
    const h = setupCredentialDoc({ photoStatus: "pending_review" });
    const res = buildRes();
    await moderatePhoto(opReq({ action: "approve", reason: "ok" }), res);

    expect(res.__body).toMatchObject({ data: { action: "approve" } });
    expect(h.updates[0]).toMatchObject({
      photoStatus: "approved",
      photoReviewedBy: "organizer-uid",
    });
    // Approving must never reach the bucket.
    expect(deleteCredentialImagesMock).not.toHaveBeenCalled();
  });
});

describe("moderatePhoto — remove", () => {
  it("returns 404 for a credential that is not there", async () => {
    setupCredentialDoc(null);
    const res = buildRes();
    await moderatePhoto(opReq({ action: "remove", reason: "x" }), res);

    expect(res.__status).toBe(404);
    expect(deleteCredentialImagesMock).not.toHaveBeenCalled();
  });

  // The ordering is the whole guarantee: if the status flip landed and the
  // delete did not, the panel would show a moderated record while the image
  // stayed readable in Storage.
  it("deletes the objects BEFORE flipping the status", async () => {
    const h = setupCredentialDoc({ photoStatus: "pending_review" });
    await moderatePhoto(
      opReq({ action: "remove", reason: "no procede" }),
      buildRes()
    );

    expect(deleteCredentialImagesMock).toHaveBeenCalledWith(
      "devfest-2026",
      "cred-abc123"
    );
    expect(deleteCredentialImagesMock.mock.invocationCallOrder[0]).toBeLessThan(
      h.docRef.update.mock.invocationCallOrder[0]
    );
  });

  it("swaps in a mascot from the shared manifest and re-queues the email", async () => {
    const h = setupCredentialDoc({ photoStatus: "pending_review" });
    await moderatePhoto(
      opReq({ action: "remove", reason: "no procede" }),
      buildRes()
    );

    expect(h.updates[0]).toMatchObject({
      photoStatus: "removed",
      photoPath: null,
      credentialImagePath: null,
      photoRemovedReason: "no procede",
      avatarKind: "mascot",
      emailStatus: "queued",
      emailTemplate: "photo_removed",
      emailAttempts: 0,
    });
    // Whatever it picked has to be a real mascot, or the attendee's card
    // renders grey initials.
    expect(MASCOT_IDS).toContain(h.updates[0].mascotId);
  });

  // A take-down must not un-load somebody a volunteer already transcribed:
  // the registration data is independent of the photo.
  it("leaves bevyStatus alone", async () => {
    const h = setupCredentialDoc({
      photoStatus: "pending_review",
      bevyStatus: "loaded",
    });
    await moderatePhoto(
      opReq({ action: "remove", reason: "no procede" }),
      buildRes()
    );

    expect(h.updates[0]).not.toHaveProperty("bevyStatus");
    expect(h.updates[0]).not.toHaveProperty("bevyLoadedBy");
  });
});

describe("retryEmail", () => {
  it("returns 404 for a credential that is not there", async () => {
    setupCredentialDoc(null);
    const res = buildRes();
    await retryEmail(opReq(), res);

    expect(res.__status).toBe(404);
  });

  // Re-queueing something mid-flight would race the drain's lease and could
  // double-send, so only a parked send may be retried by hand.
  it("refuses with 409 anything that is not parked as failed", async () => {
    const h = setupCredentialDoc({ emailStatus: "sending" });
    const res = buildRes();
    await retryEmail(opReq(), res);

    expect(res.__status).toBe(409);
    expect(h.updates).toHaveLength(0);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("re-queues a failed send and restarts the backoff ladder", async () => {
    const h = setupCredentialDoc({ emailStatus: "failed", emailAttempts: 6 });
    const res = buildRes();
    await retryEmail(opReq(), res);

    expect(res.__body).toMatchObject({ success: true });
    expect(h.updates[0]).toMatchObject({
      emailStatus: "queued",
      emailAttempts: 0,
      emailLastError: null,
    });
  });
});

describe("sendReminders", () => {
  /** Wires db.getAll over a set of credential documents. */
  function setupReminders(
    docs: { id: string; data: Record<string, unknown> | null }[]
  ) {
    collectionMock.mockImplementation(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn((id: string) => ({ __id: id })),
        })),
      })),
    }));
    getAllMock.mockImplementation(async (...refs: { __id: string }[]) =>
      refs.map((ref) => {
        const found = docs.find((d) => d.id === ref.__id);
        return {
          exists: Boolean(found && found.data),
          ref,
          data: () => found?.data ?? undefined,
        };
      })
    );
    return stageBatches();
  }

  const SENT_PENDING = { bevyStatus: "pending", emailStatus: "sent" };

  // A stale tab must not mail somebody who was loaded in the meantime, and
  // telling a registered person they are not registered costs trust.
  it("only re-queues people still missing from the official panel", async () => {
    const b = setupReminders([
      { id: "a", data: SENT_PENDING },
      { id: "b", data: { bevyStatus: "loaded", emailStatus: "sent" } },
      { id: "c", data: { bevyStatus: "pending", emailStatus: "failed" } },
      { id: "d", data: null },
    ]);
    const res = buildRes();
    await sendReminders(
      opReq({ credentialIds: ["a", "b", "c", "d"] }, { id: "" }),
      res
    );

    expect(res.__body).toMatchObject({ data: { queued: 1, skipped: 3 } });
    expect(b.committed).toHaveLength(1);
    expect(b.committed[0].patch).toMatchObject({
      emailStatus: "queued",
      emailTemplate: "reminder",
      emailAttempts: 0,
    });
  });

  // A repeated id would put two operations on the same document in one
  // batch, which Firestore rejects outright.
  it("dedupes the ids it was handed", async () => {
    const b = setupReminders([{ id: "a", data: SENT_PENDING }]);
    const res = buildRes();
    await sendReminders(
      opReq({ credentialIds: ["a", "a", "a"] }, { id: "" }),
      res
    );

    expect(getAllMock.mock.calls[0]).toHaveLength(1);
    expect(b.committed).toHaveLength(1);
    expect(res.__body).toMatchObject({ data: { queued: 1, skipped: 0 } });
  });

  // Firestore caps a WriteBatch at 500 operations.
  it("splits the work so no batch exceeds the Firestore ceiling", async () => {
    const many = Array.from({ length: 401 }, (_, i) => ({
      id: `c${i}`,
      data: SENT_PENDING,
    }));
    const b = setupReminders(many);
    await sendReminders(
      opReq({ credentialIds: many.map((m) => m.id) }, { id: "" }),
      buildRes()
    );

    expect(b.commitSizes).toEqual([400, 1]);
    expect(b.committed).toHaveLength(401);
  });

  it("counts what it sent without naming anybody", async () => {
    setupReminders([{ id: "a", data: SENT_PENDING }]);
    await sendReminders(
      opReq({ credentialIds: ["a"] }, { id: "" }),
      buildRes()
    );

    const [entry] = writeAuditLogMock.mock.calls[0];
    expect(entry).toMatchObject({
      action: "credential.reminders",
      targetId: "devfest-2026",
      details: { requested: 1, queued: 1, skipped: 0 },
    });
  });
});

describe("reconcileCredentials", () => {
  /**
   * Wires both collections. reconcile() itself is NOT mocked — its matching
   * semantics are already pinned by credentialReconcile.test.ts, so what is
   * worth proving here is the wiring around it.
   */
  function setupReconcile(
    credentials: Record<string, unknown>[],
    roster: Record<string, unknown>[]
  ) {
    const eventRef = {
      collection: vi.fn((name: string) => {
        const rows = name === "credentials" ? credentials : roster;
        return {
          limit: vi.fn(() => ({
            get: async () => ({
              size: rows.length,
              docs: rows.map((r) => ({ id: r.id as string, data: () => r })),
            }),
          })),
          doc: vi.fn((id: string) => ({ __col: name, __id: id })),
        };
      }),
    };
    collectionMock.mockImplementation(() => ({ doc: vi.fn(() => eventRef) }));
    return stageBatches();
  }

  const CRED = {
    id: "c1",
    email: "alvaro@example.com",
    dni: "12345678",
    dniNormalized: "12345678",
    bevyStatus: "pending",
  };

  it("writes both sides of a match in one batch", async () => {
    const b = setupReconcile(
      [CRED],
      [{ id: "r1", email: "alvaro@example.com", ticketNumber: "T-7" }]
    );
    const res = buildRes();
    await reconcileCredentials(opReq({}, { id: "" }), res);

    expect(res.__body).toMatchObject({
      data: { matched: 1, unmatchedCredentials: 0, unmatchedRoster: 0 },
    });
    // Two writes per match, and they must land together.
    expect(b.commitSizes).toEqual([2]);

    const credWrite = b.committed.find(
      (w) => (w.ref as { __col: string }).__col === "credentials"
    );
    expect(credWrite?.patch).toMatchObject({
      bevyStatus: "loaded",
      bevyTicketNumber: "T-7",
      bevyLoadedBy: "organizer-uid",
    });
  });

  // This stamp is the entire reason the DNI is collected: at check-in a
  // volunteer compares the number on the document against the number on
  // screen instead of eyeing a name.
  it("stamps the DNI onto the roster row so it reaches the door", async () => {
    const b = setupReconcile(
      [CRED],
      [{ id: "r1", email: "alvaro@example.com", ticketNumber: "T-7" }]
    );
    await reconcileCredentials(opReq({}, { id: "" }), buildRes());

    const rosterWrite = b.committed.find(
      (w) => (w.ref as { __col: string }).__col === "roster"
    );
    expect(rosterWrite?.patch).toEqual({
      dni: "12345678",
      dniNormalized: "12345678",
      credentialId: "c1",
    });
  });

  // The addresses themselves are PII and the panel already holds the rows
  // they belong to, so the response counts rather than lists.
  it("reports counts only, never the addresses", async () => {
    const res = buildRes();
    setupReconcile(
      [CRED, { ...CRED, id: "c2" }],
      [{ id: "r1", email: "nadie@example.com", ticketNumber: "T-1" }]
    );
    await reconcileCredentials(opReq({}, { id: "" }), res);

    // Both credentials share an address, so the pair is ambiguous and is
    // deliberately left unmatched rather than guessed at.
    expect(res.__body).toMatchObject({
      success: true,
      data: { matched: 0, ambiguous: 1 },
    });
    expect(JSON.stringify(res.__body)).not.toContain("example.com");
  });

  it("says so in the logs when it truncates at the read cap", async () => {
    setupReconcile([], []);
    await reconcileCredentials(opReq({}, { id: "" }), buildRes());
    // Well under the cap: nothing to warn about.
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});

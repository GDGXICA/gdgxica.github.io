import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-2026";
const PHOTO = `credentials/${SLUG}/cred-abc123/photo.jpg`;
const CARD = `credentials/${SLUG}/cred-abc123/credential.jpg`;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const HOUR = 60 * 60 * 1000;

async function seedRole(
  uid: string,
  role: string,
  over: Record<string, unknown> = {}
) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role, ...over });
  });
}

/**
 * Seeds events/{slug}/staff/{uid} the way the API would.
 *
 * `expiresAt: undefined` writes no key at all, which is the "never expires"
 * shape — distinct from an explicit null, and both have to keep granting.
 */
async function seedStaff(
  uid: string,
  { slug = SLUG, expiresAt }: { slug?: string; expiresAt?: Date | null } = {}
) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `events/${slug}/staff/${uid}`), {
      uid,
      role: "volunteer",
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
  });
}

/** Uploads an object the way the Admin SDK would, bypassing rules. */
async function seedObject(path: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), JPEG, {
      contentType: "image/jpeg",
    });
  });
}

describe("credential storage rules", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("read access", () => {
    it("denies anonymous reads", async () => {
      // These are personal photographs; a guessable object path must not
      // be enough to fetch one.
      const env = await getTestEnv();
      await seedObject(PHOTO);
      const anon = env.unauthenticatedContext().storage();
      await assertFails(getBytes(ref(anon, PHOTO)));
    });

    it("denies reads to a signed-in member", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("member-1", "member");
      const st = env.authenticatedContext("member-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("denies reads to an authenticated user with no role document", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      const st = env.authenticatedContext("stranger").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("allows organizer reads so the moderation panel can render", async () => {
      // The rule resolves the role through firestore.get(), which is what
      // lets the panel use getDownloadURL() with no signed-URL endpoint.
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("org-1", "organizer");
      const st = env.authenticatedContext("org-1").storage();
      await assertSucceeds(getBytes(ref(st, PHOTO)));
    });

    it("allows admin reads", async () => {
      const env = await getTestEnv();
      await seedObject(CARD);
      await seedRole("admin-1", "admin");
      const st = env.authenticatedContext("admin-1").storage();
      await assertSucceeds(getBytes(ref(st, CARD)));
    });
  });

  // These images are the same class of personal data as the roster, so the
  // rule has to mirror canOnEvent('roster:read', …) in firestore.rules. It
  // did not: it checked only that the staff document EXISTED, so a volunteer
  // whose assignment had expired kept downloading DNI photos of an event
  // they no longer worked — while Firestore already denied them the
  // credential document holding the same person's name and DNI.
  describe("volunteer, scoped by assignment", () => {
    it("allows a volunteer assigned to this event", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer");
      await seedStaff("vol-1");
      const st = env.authenticatedContext("vol-1").storage();
      await assertSucceeds(getBytes(ref(st, PHOTO)));
    });

    it("allows an assignment with an explicit null expiry", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer");
      await seedStaff("vol-1", { expiresAt: null });
      const st = env.authenticatedContext("vol-1").storage();
      await assertSucceeds(getBytes(ref(st, PHOTO)));
    });

    it("allows an assignment that has not expired yet", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer");
      await seedStaff("vol-1", { expiresAt: new Date(Date.now() + HOUR) });
      const st = env.authenticatedContext("vol-1").storage();
      await assertSucceeds(getBytes(ref(st, PHOTO)));
    });

    it("DENIES an assignment that already expired", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer");
      await seedStaff("vol-1", { expiresAt: new Date(Date.now() - HOUR) });
      const st = env.authenticatedContext("vol-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("denies a volunteer with no assignment at all", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer");
      const st = env.authenticatedContext("vol-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("denies a volunteer assigned to a different event", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer");
      await seedStaff("vol-1", { slug: "otro-evento-2026" });
      const st = env.authenticatedContext("vol-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });
  });

  // Suspension and revocation are the two levers for taking access away. Both
  // are enforced by the API on every request; Storage has to agree, or the
  // lever only works on the half of the panel that goes through the API.
  describe("suspension and revocation", () => {
    it("denies a suspended organizer", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("org-1", "organizer", { status: "suspended" });
      const st = env.authenticatedContext("org-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("denies an organizer whose roster:read was revoked", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("org-1", "organizer", { revocations: ["roster:read"] });
      const st = env.authenticatedContext("org-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("denies an admin whose roster:read was revoked", async () => {
      const env = await getTestEnv();
      await seedObject(CARD);
      await seedRole("adm-1", "admin", { revocations: ["roster:read"] });
      const st = env.authenticatedContext("adm-1").storage();
      await assertFails(getBytes(ref(st, CARD)));
    });

    it("denies an assigned volunteer whose roster:read was revoked", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("vol-1", "volunteer", { revocations: ["roster:read"] });
      await seedStaff("vol-1");
      const st = env.authenticatedContext("vol-1").storage();
      await assertFails(getBytes(ref(st, PHOTO)));
    });

    it("still allows an organizer with an unrelated permission revoked", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("org-1", "organizer", { revocations: ["events:write"] });
      const st = env.authenticatedContext("org-1").storage();
      await assertSucceeds(getBytes(ref(st, PHOTO)));
    });
  });

  describe("writes are closed to every client", () => {
    // Images arrive as base64 in the request body and the Cloud Function is
    // the only thing that puts bytes in this bucket. No anonymous
    // principal ever holds a write grant.
    it("denies anonymous uploads", async () => {
      const env = await getTestEnv();
      const anon = env.unauthenticatedContext().storage();
      await assertFails(uploadBytes(ref(anon, PHOTO), JPEG));
    });

    for (const role of ["member", "organizer", "admin"]) {
      it(`denies uploads from a ${role}`, async () => {
        const env = await getTestEnv();
        await seedRole(`u-${role}`, role);
        const st = env.authenticatedContext(`u-${role}`).storage();
        await assertFails(uploadBytes(ref(st, PHOTO), JPEG));
      });
    }

    it("denies overwriting an existing object", async () => {
      const env = await getTestEnv();
      await seedObject(PHOTO);
      await seedRole("admin-1", "admin");
      const st = env.authenticatedContext("admin-1").storage();
      await assertFails(uploadBytes(ref(st, PHOTO), JPEG));
    });
  });

  describe("everything outside the credential prefix", () => {
    it("is denied for reads and writes", async () => {
      const env = await getTestEnv();
      await seedRole("admin-1", "admin");
      const st = env.authenticatedContext("admin-1").storage();
      await assertFails(getBytes(ref(st, "otros/archivo.jpg")));
      await assertFails(uploadBytes(ref(st, "otros/archivo.jpg"), JPEG));
    });
  });
});

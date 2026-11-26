import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-2026";
const CERTIFICATE = "certificates/0123456789abcdef0123456789abcdef";
const SETTINGS = `events/${SLUG}/certificateMeta/settings`;

async function seedRole(uid: string, role: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role });
  });
}

async function seedCertificate() {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), CERTIFICATE), {
      eventSlug: SLUG,
      kind: "attendee",
      name: "Ana Torres",
      email: "ana@example.com",
      status: "sent",
    });
    await setDoc(doc(ctx.firestore(), SETTINGS), { eventName: "DevFest" });
  });
}

describe("certificate rules", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("deny anonymous visitors", async () => {
    await seedCertificate();
    const db = (await getTestEnv()).unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, CERTIFICATE)));
    await assertFails(getDoc(doc(db, SETTINGS)));
  });

  it.each(["member", "volunteer", "organizer", "admin"])(
    "deny %s reads and writes — certificates go through the API",
    async (role) => {
      // Organizers and admins send certificates, but only through the API,
      // which re-checks check-in. A direct write could queue anyone.
      await seedCertificate();
      await seedRole(`${role}-1`, role);
      const db = (await getTestEnv())
        .authenticatedContext(`${role}-1`)
        .firestore();
      await assertFails(getDoc(doc(db, CERTIFICATE)));
      await assertFails(
        setDoc(doc(db, CERTIFICATE), { status: "queued" }, { merge: true })
      );
      await assertFails(getDoc(doc(db, SETTINGS)));
      await assertFails(setDoc(doc(db, SETTINGS), { eventName: "x" }));
    }
  );
});

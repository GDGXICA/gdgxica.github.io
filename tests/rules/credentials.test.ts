import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-2026";
const CREDENTIAL = `events/${SLUG}/credentials/cred-abc123`;
const COUNTER = `events/${SLUG}/credentialMeta/counters`;

async function seedRole(uid: string, role: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role });
  });
}

/** Seeds a credential the way createCredential would. */
async function seedCredential(over: Record<string, unknown> = {}) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), CREDENTIAL), {
      dni: "12345678",
      dniNormalized: "12345678",
      firstName: "Alvaro",
      lastName: "Pena",
      email: "alvaro@example.com",
      sequenceNumber: 1,
      groupLetter: "A",
      photoStatus: "pending_review",
      emailStatus: "queued",
      bevyStatus: "pending",
      ...over,
    });
  });
}

describe("credential rules", () => {
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
    it("denies anonymous reads — credentials hold DNI and email", async () => {
      // The parent event document is publicly readable. Rules do NOT
      // cascade into subcollections, and this is the assertion that pins
      // it: a regression here would expose every attendee's DNI.
      const env = await getTestEnv();
      await seedCredential();
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, CREDENTIAL)));
    });

    it("denies reads to a signed-in member", async () => {
      const env = await getTestEnv();
      await seedCredential();
      await seedRole("member-1", "member");
      const db = env.authenticatedContext("member-1").firestore();
      await assertFails(getDoc(doc(db, CREDENTIAL)));
    });

    it("denies reads to an authenticated user with no role document", async () => {
      const env = await getTestEnv();
      await seedCredential();
      const db = env.authenticatedContext("stranger").firestore();
      await assertFails(getDoc(doc(db, CREDENTIAL)));
    });

    it("allows organizer reads", async () => {
      const env = await getTestEnv();
      await seedCredential();
      await seedRole("org-1", "organizer");
      const db = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(db, CREDENTIAL)));
    });

    it("allows admin reads", async () => {
      const env = await getTestEnv();
      await seedCredential();
      await seedRole("admin-1", "admin");
      const db = env.authenticatedContext("admin-1").firestore();
      await assertSucceeds(getDoc(doc(db, CREDENTIAL)));
    });

    it("allows an organizer to list the collection", async () => {
      const env = await getTestEnv();
      await seedCredential();
      await seedRole("org-1", "organizer");
      const db = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(
        getDocs(collection(db, `events/${SLUG}/credentials`))
      );
    });

    it("denies an anonymous list", async () => {
      const env = await getTestEnv();
      await seedCredential();
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(
        getDocs(collection(anon, `events/${SLUG}/credentials`))
      );
    });
  });

  // These assertions are what pin the decision that every credential
  // mutation goes through a Cloud Function. Unlike the roster, where
  // volunteers write check-ins directly so they queue offline, nothing
  // here may be written from a client — photo take-down has to delete a
  // Storage object in the same operation as the status flip.
  describe("writes are closed to everyone, including admins", () => {
    for (const role of ["member", "organizer", "admin"]) {
      it(`denies create to a ${role}`, async () => {
        const env = await getTestEnv();
        await seedRole(`u-${role}`, role);
        const db = env.authenticatedContext(`u-${role}`).firestore();
        await assertFails(
          addDoc(collection(db, `events/${SLUG}/credentials`), {
            dni: "12345678",
            firstName: "Intruso",
          })
        );
      });

      it(`denies update to a ${role}`, async () => {
        const env = await getTestEnv();
        await seedCredential();
        await seedRole(`u-${role}`, role);
        const db = env.authenticatedContext(`u-${role}`).firestore();
        await assertFails(
          updateDoc(doc(db, CREDENTIAL), { bevyStatus: "loaded" })
        );
      });

      it(`denies delete to a ${role}`, async () => {
        const env = await getTestEnv();
        await seedCredential();
        await seedRole(`u-${role}`, role);
        const db = env.authenticatedContext(`u-${role}`).firestore();
        await assertFails(deleteDoc(doc(db, CREDENTIAL)));
      });
    }

    it("denies an anonymous create", async () => {
      // The public endpoint writes through the Admin SDK; the browser
      // never touches this collection directly.
      const env = await getTestEnv();
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(
        addDoc(collection(anon, `events/${SLUG}/credentials`), { dni: "1" })
      );
    });

    it("denies a client rewriting its own photoStatus", async () => {
      const env = await getTestEnv();
      await seedCredential();
      await seedRole("org-1", "organizer");
      const db = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(db, CREDENTIAL), { photoStatus: "approved" })
      );
    });
  });

  describe("credentialMeta counter", () => {
    it("allows organizer reads", async () => {
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), COUNTER), { nextSequence: 5 });
      });
      await seedRole("org-1", "organizer");
      const db = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(db, COUNTER)));
    });

    it("denies anonymous reads", async () => {
      const env = await getTestEnv();
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, COUNTER)));
    });

    it("denies writes even to an admin", async () => {
      // A client that could bump the counter could hand itself sequence
      // number 1 and win the "first N attendees" draw.
      const env = await getTestEnv();
      await seedRole("admin-1", "admin");
      const db = env.authenticatedContext("admin-1").firestore();
      await assertFails(setDoc(doc(db, COUNTER), { nextSequence: 1 }));
    });
  });

  describe("credential_email_budget", () => {
    it("is fully closed to clients", async () => {
      const env = await getTestEnv();
      await seedRole("admin-1", "admin");
      const db = env.authenticatedContext("admin-1").firestore();
      await assertFails(getDoc(doc(db, "credential_email_budget/2026-11-21")));
      await assertFails(
        setDoc(doc(db, "credential_email_budget/2026-11-21"), { sent: 0 })
      );
    });
  });

  describe("terminal catch-all", () => {
    it("still denies a made-up sibling subcollection", async () => {
      // Regression guard: adding blocks under events/{slug} must not
      // accidentally widen anything else.
      const env = await getTestEnv();
      await seedRole("admin-1", "admin");
      const db = env.authenticatedContext("admin-1").firestore();
      await assertFails(
        getDoc(doc(db, `events/${SLUG}/credentialSecrets/whatever`))
      );
    });
  });
});

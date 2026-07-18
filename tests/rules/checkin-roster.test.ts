import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-ica-2026";
const ATTENDEE = `events/${SLUG}/roster/t_GOOGA263171317`;

/** Seeds a users/{uid} doc with the given role, bypassing rules. */
async function seedRole(uid: string, role: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role });
  });
}

/** Seeds a roster doc the way the import Cloud Function would. */
async function seedAttendee(over: Record<string, unknown> = {}) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ATTENDEE), {
      ticketNumber: "GOOGA263171317",
      firstName: "Alex Alberto",
      lastName: "Quintanilla Garcia",
      email: "wcandry@gmail.com",
      bevyCheckinAt: null,
      checkedIn: false,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByName: null,
      note: null,
      dniVerified: false,
      ...over,
    });
  });
}

describe("checkin roster rules", () => {
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
    it("denies anonymous reads — the roster holds attendee emails", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, ATTENDEE)));
    });

    it("denies a signed-in member (public read on events/ must not cascade)", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("member-1", "member");
      const member = env.authenticatedContext("member-1").firestore();
      await assertFails(getDoc(doc(member, ATTENDEE)));
    });

    it("denies a signed-in user with no users/ doc at all", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      const ghost = env.authenticatedContext("ghost").firestore();
      await assertFails(getDoc(doc(ghost, ATTENDEE)));
    });

    // The full chain an outsider would actually attempt. The public event
    // pages mint anonymous Firebase tokens (signInAnonymouslyIfNeeded), so
    // request.auth != null is free to anyone who loads the site. The
    // pre-existing users/ rule then lets them self-register — capped at
    // role "member". This asserts the two halves compose safely: a real
    // token plus a real users/ doc still must not reach attendee PII.
    it("denies an anonymous user who self-registers as member", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      const anonUid = "anon-visitor";
      const anon = env.authenticatedContext(anonUid).firestore();

      // Goes through the real rule, not withSecurityRulesDisabled — if
      // this ever starts failing, self-registration changed and the
      // premise of the test needs revisiting.
      await assertSucceeds(
        setDoc(doc(anon, `users/${anonUid}`), {
          uid: anonUid,
          email: "",
          displayName: "",
          photoURL: "",
          role: "member",
        })
      );

      await assertFails(getDoc(doc(anon, ATTENDEE)));
    });

    it("denies self-escalation to organizer to reach the roster", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("climber", "member");
      const climber = env.authenticatedContext("climber").firestore();
      // users/ denies update outright, so the role cannot be raised.
      await assertFails(
        updateDoc(doc(climber, "users/climber"), { role: "organizer" })
      );
      await assertFails(getDoc(doc(climber, ATTENDEE)));
    });

    it("allows an organizer", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(org, ATTENDEE)));
    });

    it("allows an admin", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("adm-1", "admin");
      const adm = env.authenticatedContext("adm-1").firestore();
      await assertSucceeds(getDoc(doc(adm, ATTENDEE)));
    });
  });

  describe("first check-in on a freshly imported document", () => {
    /**
     * Seeds a document exactly as importRoster leaves it: roster fields
     * only, with NO checkedIn/checkedInAt/checkedInBy keys at all.
     */
    async function seedImportedOnly() {
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), ATTENDEE), {
          ticketNumber: "GOOGA263171317",
          firstName: "Alex Alberto",
          lastName: "Quintanilla Garcia",
          email: "wcandry@gmail.com",
          searchTokens: ["alex", "quintanilla"],
          bevyCheckinAt: null,
          lastImportId: "imp_1",
        });
      });
    }

    // The import deliberately writes no check-in fields, so the very first
    // check-in ADDS those keys rather than changing them. Every other test
    // seeds them up front, which would keep passing even if a future rules
    // edit started requiring them to pre-exist — and that would break every
    // first check-in in production while the suite stayed green.
    it("allows an organizer to add the check-in keys", async () => {
      const env = await getTestEnv();
      await seedImportedOnly();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInAt: new Date(),
          checkedInBy: "org-1",
          checkedInByName: "Alvaro",
        })
      );
    });

    it("still rejects a roster field smuggled into that first write", async () => {
      const env = await getTestEnv();
      await seedImportedOnly();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "org-1",
          email: "attacker@evil.com",
        })
      );
    });
  });

  describe("bounds on the remaining allowlisted fields", () => {
    it("rejects an over-long checkedInByName", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "org-1",
          checkedInByName: "x".repeat(121),
        })
      );
    });

    it("rejects a dniMatchScore outside 0..1", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "org-1",
          dniMatchScore: 7,
        })
      );
    });

    it("rejects a non-boolean dniVerified", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "org-1",
          dniVerified: "yes",
        })
      );
    });
  });

  describe("check-in writes", () => {
    it("allows an organizer to mark someone present", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInAt: new Date(),
          checkedInBy: "org-1",
          checkedInByName: "Alvaro",
        })
      );
    });

    it("allows un-checking without attribution", async () => {
      const env = await getTestEnv();
      await seedAttendee({ checkedIn: true, checkedInBy: "org-1" });
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: false,
          checkedInAt: null,
          checkedInBy: null,
        })
      );
    });

    it("denies a member marking someone present", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("member-1", "member");
      const member = env.authenticatedContext("member-1").firestore();
      await assertFails(
        updateDoc(doc(member, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "member-1",
        })
      );
    });

    it("denies attributing a check-in to somebody else", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "someone-else",
        })
      );
    });
  });

  describe("roster fields are immutable from the client", () => {
    it("denies rewriting the attendee email", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), { email: "attacker@evil.com" })
      );
    });

    it("denies rewriting the name", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(updateDoc(doc(org, ATTENDEE), { firstName: "Otro" }));
    });

    it("denies faking bevyCheckinAt, which the Bevy sync diffs against", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), { bevyCheckinAt: new Date() })
      );
    });

    it("denies smuggling a roster field alongside a valid check-in", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "org-1",
          email: "attacker@evil.com",
        })
      );
    });

    it("denies a non-boolean checkedIn", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), { checkedIn: "yes", checkedInBy: "org-1" })
      );
    });

    it("denies an over-long note", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        updateDoc(doc(org, ATTENDEE), {
          checkedIn: true,
          checkedInBy: "org-1",
          note: "x".repeat(201),
        })
      );
    });
  });

  describe("create and delete are Admin SDK only", () => {
    it("denies an organizer creating a roster doc directly", async () => {
      const env = await getTestEnv();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        setDoc(doc(org, `events/${SLUG}/roster/t_FAKE`), {
          ticketNumber: "FAKE",
          email: "x@x.com",
          checkedIn: false,
        })
      );
    });

    it("denies an admin deleting a roster doc", async () => {
      const env = await getTestEnv();
      await seedAttendee();
      await seedRole("adm-1", "admin");
      const adm = env.authenticatedContext("adm-1").firestore();
      await assertFails(deleteDoc(doc(adm, ATTENDEE)));
    });
  });

  describe("checkinMeta", () => {
    it("allows an organizer to read import metadata", async () => {
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `events/${SLUG}/checkinMeta/current`), {
          rosterCount: 34,
        });
      });
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(
        getDoc(doc(org, `events/${SLUG}/checkinMeta/current`))
      );
    });

    it("denies client writes to import metadata", async () => {
      const env = await getTestEnv();
      await seedRole("org-1", "organizer");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(
        setDoc(doc(org, `events/${SLUG}/checkinMeta/current`), {
          rosterCount: 999,
        })
      );
    });
  });
});

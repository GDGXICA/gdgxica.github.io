import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-2025";
const INSTANCE_ID = "instance-A";

const SAMPLE_INSTANCE = {
  eventSlug: SLUG,
  templateId: "tpl-1",
  templateVersion: 1,
  type: "poll",
  mode: "realtime",
  state: "scheduled",
  title: "Sample poll",
  config: { question: "Q?", options: [] },
  order: 0,
  createdBy: "admin-uid",
  createdAt: 0,
};

describe("firestore.rules — events/{slug}/minigames", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allows anyone to read the shadow event doc", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `events/${SLUG}`), {
        slug: SLUG,
        createdAt: 0,
      });
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, `events/${SLUG}`)));
  });

  it("allows anyone to read instance docs", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `events/${SLUG}/minigames/${INSTANCE_ID}`),
        SAMPLE_INSTANCE
      );
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDoc(doc(anon, `events/${SLUG}/minigames/${INSTANCE_ID}`))
    );
  });

  it("allows anyone to read aggregates (for live overlays)", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `events/${SLUG}/minigames/${INSTANCE_ID}/aggregates/current`
        ),
        { totalResponses: 0 }
      );
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDoc(
        doc(anon, `events/${SLUG}/minigames/${INSTANCE_ID}/aggregates/current`)
      )
    );
  });

  it("denies authenticated client writes to the event shadow doc", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(doc(auth, `events/${SLUG}`), { slug: SLUG, createdAt: 0 })
    );
  });

  it("denies authenticated client writes to instance docs", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(auth, `events/${SLUG}/minigames/${INSTANCE_ID}`),
        SAMPLE_INSTANCE
      )
    );
  });

  it("denies authenticated client writes to subcollections (PR3 baseline)", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    const base = `events/${SLUG}/minigames/${INSTANCE_ID}`;
    await assertFails(
      setDoc(doc(auth, `${base}/participants/u1`), { alias: "a" })
    );
    await assertFails(
      setDoc(doc(auth, `${base}/responses/u1_q1`), {
        questionId: "q1",
        optionId: "a",
      })
    );
    await assertFails(
      setDoc(doc(auth, `${base}/words/hello`), { text: "hello", count: 1 })
    );
    await assertFails(
      setDoc(doc(auth, `${base}/aggregates/current`), { totalResponses: 1 })
    );
  });

  it("denies client deletes on instances", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `events/${SLUG}/minigames/${INSTANCE_ID}`),
        SAMPLE_INSTANCE
      );
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      deleteDoc(doc(auth, `events/${SLUG}/minigames/${INSTANCE_ID}`))
    );
  });
});

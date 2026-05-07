import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SAMPLE_POLL = {
  type: "poll",
  title: "Sample",
  description: "",
  poll: {
    question: "Q?",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  },
  createdAt: 0,
  updatedAt: 0,
  createdBy: "admin-uid",
  version: 1,
};

describe("firestore.rules — minigame_templates", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allows authenticated users to read templates", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "minigame_templates/template-1"),
        SAMPLE_POLL
      );
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertSucceeds(getDoc(doc(auth, "minigame_templates/template-1")));
    await assertSucceeds(getDocs(collection(auth, "minigame_templates")));
  });

  it("denies unauthenticated reads", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "minigame_templates/template-1"),
        SAMPLE_POLL
      );
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "minigame_templates/template-1")));
  });

  it("denies all client writes — even from authenticated users", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(doc(auth, "minigame_templates/template-1"), SAMPLE_POLL)
    );
  });

  it("denies anonymous writes", async () => {
    const env = await getTestEnv();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(anon, "minigame_templates/template-1"), SAMPLE_POLL)
    );
  });

  it("denies client deletes", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "minigame_templates/template-1"),
        SAMPLE_POLL
      );
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(deleteDoc(doc(auth, "minigame_templates/template-1")));
  });
});

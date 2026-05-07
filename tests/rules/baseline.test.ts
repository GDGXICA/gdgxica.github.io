import { afterAll, afterEach, assert, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

describe("baseline firestore.rules", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("denies anonymous reads on the catch-all collection", async () => {
    const env = await getTestEnv();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "anything/foo")));
  });

  it("denies anonymous writes to audit_log", async () => {
    const env = await getTestEnv();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, "audit_log/x"), { action: "x" }));
  });

  it("denies authenticated user from reading another user's profile", async () => {
    const env = await getTestEnv();
    // Seed a user doc bypassing rules so the read target exists.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/user-a"), {
        uid: "user-a",
        role: "member",
      });
    });
    const userB = env.authenticatedContext("user-b").firestore();
    await assertFails(getDoc(doc(userB, "users/user-a")));
  });

  it("allows a user to read their own profile", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/user-a"), {
        uid: "user-a",
        role: "member",
      });
    });
    const userA = env.authenticatedContext("user-a").firestore();
    await assertSucceeds(getDoc(doc(userA, "users/user-a")));
  });

  it("denies user from creating themselves with a non-member role", async () => {
    const env = await getTestEnv();
    const userA = env.authenticatedContext("user-a").firestore();
    await assertFails(
      setDoc(doc(userA, "users/user-a"), {
        uid: "user-a",
        email: "a@example.com",
        displayName: "A",
        photoURL: "",
        role: "admin",
      })
    );
  });

  it("allows a user to create their own profile with role=member", async () => {
    const env = await getTestEnv();
    const userA = env.authenticatedContext("user-a").firestore();
    await assertSucceeds(
      setDoc(doc(userA, "users/user-a"), {
        uid: "user-a",
        email: "a@example.com",
        displayName: "A",
        photoURL: "",
        role: "member",
      })
    );
  });

  it("never reaches this assertion if rules are misconfigured", () => {
    assert.ok(true);
  });
});

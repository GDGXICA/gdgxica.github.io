import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-ica-2026";
const PHOTO = `mural/${SLUG}/9f8e7d6c-1111-2222-3333-444455556666.jpg`;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function seedRole(uid: string, role: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role });
  });
}

async function seedStaff(uid: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `events/${SLUG}/staff/${uid}`), {
      assignedBy: "admin-1",
    });
  });
}

async function seedObject(path: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), JPEG, {
      contentType: "image/jpeg",
    });
  });
}

describe("mural photo storage rules", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("niega la escritura anónima", async () => {
    const env = await getTestEnv();
    const anon = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(anon, PHOTO), JPEG));
  });

  it("niega la escritura directa, incluso a un organizador y a un admin", async () => {
    const env = await getTestEnv();
    await seedRole("org-1", "organizer");
    await seedRole("admin-1", "admin");

    const org = env.authenticatedContext("org-1").storage();
    await assertFails(uploadBytes(ref(org, PHOTO), JPEG));

    const admin = env.authenticatedContext("admin-1").storage();
    await assertFails(uploadBytes(ref(admin, PHOTO), JPEG));
  });

  it("niega la lectura por el SDK: la puerta es la URL con token", async () => {
    const env = await getTestEnv();
    await seedObject(PHOTO);
    await seedRole("org-1", "organizer");
    await seedRole("vol-1", "volunteer");
    await seedStaff("vol-1");

    const anon = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anon, PHOTO)));

    const org = env.authenticatedContext("org-1").storage();
    await assertFails(getBytes(ref(org, PHOTO)));

    const vol = env.authenticatedContext("vol-1").storage();
    await assertFails(getBytes(ref(vol, PHOTO)));
  });

  it("niega el borrado desde el cliente — la retirada la hace el Admin SDK", async () => {
    const env = await getTestEnv();
    await seedObject(PHOTO);
    await seedRole("admin-1", "admin");
    const admin = env.authenticatedContext("admin-1").storage();

    const { deleteObject } = await import("firebase/storage");
    await assertFails(deleteObject(ref(admin, PHOTO)));
  });
});

import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { cleanup, clearAll, getTestEnv } from "./setup";

/**
 * Imágenes de los posts del foro.
 *
 * Son contenido PÚBLICO, y aun así el bucket está cerrado por los dos lados:
 * se escriben con el Admin SDK y se leen con la URL de descarga que lleva el
 * token guardado en los metadatos del objeto. Las dos vías se saltan estas
 * reglas, así que aquí no hay nada que abrir.
 *
 * Estos tests fijan esa decisión. Si alguien abriera `read: if true` "porque
 * son públicas", abriría también el listado del prefijo y una segunda puerta
 * que nadie usa — y revocar el token dejaría de retirar la imagen.
 */

const IMAGE = "posts/images/9f8e7d6c-1111-2222-3333-444455556666.jpg";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function seedRole(uid: string, role: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role });
  });
}

/** Sube el objeto como lo haría el Admin SDK, saltándose las reglas. */
async function seedObject(path: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), JPEG, {
      contentType: "image/jpeg",
    });
  });
}

describe("post image storage rules", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  it("niega la escritura directa, incluso a un admin", async () => {
    // El nombre del objeto lo pone el servidor. Si un cliente pudiera
    // escribir aquí, podría pisar la imagen de un post ya publicado.
    const env = await getTestEnv();
    await seedRole("admin-1", "admin");
    const st = env.authenticatedContext("admin-1").storage();
    await assertFails(uploadBytes(ref(st, IMAGE), JPEG));
  });

  it("niega la escritura anónima", async () => {
    const env = await getTestEnv();
    const anon = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(anon, IMAGE), JPEG));
  });

  it("niega la lectura por el SDK: la puerta es la URL con token", async () => {
    const env = await getTestEnv();
    await seedObject(IMAGE);
    await seedRole("org-1", "organizer");

    const anon = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(anon, IMAGE)));

    const org = env.authenticatedContext("org-1").storage();
    await assertFails(getBytes(ref(org, IMAGE)));
  });
});

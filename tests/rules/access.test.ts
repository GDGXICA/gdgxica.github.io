import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

async function seedUser(uid: string, role: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, role });
  });
}

async function seedRequest(uid: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `access_requests/${uid}`), {
      uid,
      status: "pending",
      requestedRole: "contributor",
      motivo: "quiero colaborar",
    });
  });
}

async function seedInvitation(id: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `invitations/${id}`), {
      emailLower: "invitada@example.com",
      role: "contributor",
      tokenHash: "hash-secreto",
    });
  });
}

describe("reglas de solicitudes e invitaciones", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("access_requests", () => {
    it("cada quien lee su propia solicitud", async () => {
      const env = await getTestEnv();
      await seedRequest("u1");
      const u1 = env.authenticatedContext("u1").firestore();
      await assertSucceeds(getDoc(doc(u1, "access_requests/u1")));
    });

    it("no lee la solicitud de otra persona", async () => {
      const env = await getTestEnv();
      await seedRequest("u2");
      const u1 = env.authenticatedContext("u1").firestore();
      await assertFails(getDoc(doc(u1, "access_requests/u2")));
    });

    // Ni siquiera un admin: la revisión pasa por la API, que aplica la regla
    // de no escalada. Leer desde el cliente la saltaría.
    it("un admin tampoco las lee desde el cliente", async () => {
      const env = await getTestEnv();
      await seedRequest("u2");
      await seedUser("adm", "admin");
      const adm = env.authenticatedContext("adm").firestore();
      await assertFails(getDoc(doc(adm, "access_requests/u2")));
    });

    it("nadie crea una solicitud desde el cliente", async () => {
      const env = await getTestEnv();
      const u1 = env.authenticatedContext("u1").firestore();
      await assertFails(
        setDoc(doc(u1, "access_requests/u1"), {
          uid: "u1",
          status: "approved",
        })
      );
    });

    // Lo importante: no se puede autoaprobar escribiendo el doc.
    it("no se puede cambiar el estado de la propia solicitud", async () => {
      const env = await getTestEnv();
      await seedRequest("u1");
      const u1 = env.authenticatedContext("u1").firestore();
      await assertFails(
        updateDoc(doc(u1, "access_requests/u1"), { status: "approved" })
      );
    });

    it("anónimo no lee nada", async () => {
      const env = await getTestEnv();
      await seedRequest("u1");
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, "access_requests/u1")));
    });
  });

  describe("invitations", () => {
    it("nadie las lee desde el cliente, ni el invitado", async () => {
      const env = await getTestEnv();
      await seedInvitation("inv-1");
      const u1 = env.authenticatedContext("u1").firestore();
      await assertFails(getDoc(doc(u1, "invitations/inv-1")));
    });

    it("un admin tampoco", async () => {
      const env = await getTestEnv();
      await seedInvitation("inv-1");
      await seedUser("adm", "admin");
      const adm = env.authenticatedContext("adm").firestore();
      await assertFails(getDoc(doc(adm, "invitations/inv-1")));
    });

    it("anónimo tampoco", async () => {
      const env = await getTestEnv();
      await seedInvitation("inv-1");
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, "invitations/inv-1")));
    });

    it("nadie se fabrica una invitación", async () => {
      const env = await getTestEnv();
      const u1 = env.authenticatedContext("u1").firestore();
      await assertFails(
        setDoc(doc(u1, "invitations/mia"), {
          emailLower: "u1@example.com",
          role: "admin",
          tokenHash: "x",
        })
      );
    });

    it("nadie marca una invitación como usada", async () => {
      const env = await getTestEnv();
      await seedInvitation("inv-1");
      const u1 = env.authenticatedContext("u1").firestore();
      await assertFails(
        updateDoc(doc(u1, "invitations/inv-1"), { usedBy: "u1" })
      );
    });

    it("nadie borra una invitación para reintentar", async () => {
      const env = await getTestEnv();
      await seedInvitation("inv-1");
      await seedUser("adm", "admin");
      const adm = env.authenticatedContext("adm").firestore();
      await assertFails(deleteDoc(doc(adm, "invitations/inv-1")));
    });
  });
});

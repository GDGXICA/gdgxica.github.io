import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const EVENT_A = "devfest-ica-2026";
const EVENT_B = "build-with-ai-2026";
const PHOTOS_A = `events/${EVENT_A}/muralPhotos`;
const SETTINGS_A = `events/${EVENT_A}/muralMeta/settings`;

const AUTHOR = "anon-quien-subio";
const OTHER = "anon-cualquiera";

async function seedUser(uid: string, data: Record<string, unknown>) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, ...data });
  });
}

async function seedStaff(slug: string, uid: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `events/${slug}/staff/${uid}`), {
      assignedBy: "admin-1",
    });
  });
}

async function seedPhoto(
  id: string,
  over: Record<string, unknown> = {},
  slug = EVENT_A
) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `events/${slug}/muralPhotos/${id}`), {
      eventSlug: slug,
      status: "pending",
      uid: AUTHOR,
      alias: "Ana",
      storagePath: `mural/${slug}/${id}.jpg`,
      downloadUrl: "https://firebasestorage.googleapis.com/…",
      width: 1600,
      height: 1200,
      bytes: 120_000,
      contentType: "image/jpeg",
      approvedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: "",
      removalRequestedAt: null,
      removalRequestNote: "",
      removedReason: null,
      clientRequestId: "req-0001",
      ...over,
    });
  });
}

describe("reglas del mural", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("lectura pública: solo lo aprobado", () => {
    it("deja leer una foto aprobada sin sesión — el proyector no tiene login", async () => {
      const env = await getTestEnv();
      await seedPhoto("ok", { status: "approved", approvedAt: new Date() });
      const anon = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(anon, `${PHOTOS_A}/ok`)));
    });

    it("NIEGA leer una pendiente por id, aunque se acierte el id", async () => {
      const env = await getTestEnv();
      await seedPhoto("secreta");
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, `${PHOTOS_A}/secreta`)));
    });

    it("NIEGA leer una rechazada y una retirada", async () => {
      const env = await getTestEnv();
      await seedPhoto("mala", { status: "rejected" });
      await seedPhoto("fuera", { status: "removed" });
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, `${PHOTOS_A}/mala`)));
      await assertFails(getDoc(doc(anon, `${PHOTOS_A}/fuera`)));
    });

    it("deja consultar filtrando por status aprobado", async () => {
      const env = await getTestEnv();
      await seedPhoto("ok", { status: "approved", approvedAt: new Date() });
      const anon = env.unauthenticatedContext().firestore();
      await assertSucceeds(
        getDocs(
          query(
            collection(anon, PHOTOS_A),
            where("status", "==", "approved"),
            orderBy("approvedAt", "desc"),
            limit(120)
          )
        )
      );
    });

    it("NIEGA una consulta sin la cláusula de status", async () => {
      const env = await getTestEnv();
      await seedPhoto("ok", { status: "approved", approvedAt: new Date() });
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDocs(collection(anon, PHOTOS_A)));
    });

    it("NIEGA una consulta que pide explícitamente las pendientes", async () => {
      const env = await getTestEnv();
      await seedPhoto("p");
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(
        getDocs(
          query(collection(anon, PHOTOS_A), where("status", "==", "pending"))
        )
      );
    });
  });

  describe("quien subió", () => {
    it("lee sus propias fotos en cualquier estado, para poder pedir la retirada", async () => {
      const env = await getTestEnv();
      await seedPhoto("mia");
      await seedPhoto("rechazada", {
        status: "rejected",
        reviewNote: "sale un menor sin permiso",
      });
      const author = env.authenticatedContext(AUTHOR).firestore();
      await assertSucceeds(getDoc(doc(author, `${PHOTOS_A}/mia`)));

      await assertSucceeds(getDoc(doc(author, `${PHOTOS_A}/rechazada`)));
    });

    it("consulta las suyas por uid", async () => {
      const env = await getTestEnv();
      await seedPhoto("mia");
      const author = env.authenticatedContext(AUTHOR).firestore();
      await assertSucceeds(
        getDocs(query(collection(author, PHOTOS_A), where("uid", "==", AUTHOR)))
      );
    });

    it("NIEGA a otra cuenta anónima leer la pendiente ajena", async () => {
      const env = await getTestEnv();
      await seedPhoto("ajena");
      const other = env.authenticatedContext(OTHER).firestore();
      await assertFails(getDoc(doc(other, `${PHOTOS_A}/ajena`)));
    });

    it("NIEGA consultar las fotos de otro uid", async () => {
      const env = await getTestEnv();
      await seedPhoto("ajena");
      const other = env.authenticatedContext(OTHER).firestore();
      await assertFails(
        getDocs(query(collection(other, PHOTOS_A), where("uid", "==", AUTHOR)))
      );
    });
  });

  describe("moderación", () => {
    it("un organizador lee la cola de pendientes", async () => {
      const env = await getTestEnv();
      await seedUser("org-1", { role: "organizer" });
      await seedPhoto("p");
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(org, `${PHOTOS_A}/p`)));
      await assertSucceeds(getDocs(collection(org, PHOTOS_A)));
    });

    it("un organizador consulta la cola con la forma exacta del panel", async () => {
      const env = await getTestEnv();
      await seedUser("org-1", { role: "organizer" });
      await seedPhoto("p", { createdAt: new Date() });
      const org = env.authenticatedContext("org-1").firestore();

      await assertSucceeds(
        getDocs(
          query(
            collection(org, PHOTOS_A),
            where("status", "==", "pending"),
            orderBy("createdAt", "asc"),
            limit(300)
          )
        )
      );
      await assertSucceeds(
        getDocs(
          query(
            collection(org, PHOTOS_A),
            where("status", "==", "approved"),
            orderBy("approvedAt", "desc"),
            limit(300)
          )
        )
      );
    });

    it("un admin también", async () => {
      const env = await getTestEnv();
      await seedUser("admin-1", { role: "admin" });
      await seedPhoto("p");
      const admin = env.authenticatedContext("admin-1").firestore();
      await assertSucceeds(getDocs(collection(admin, PHOTOS_A)));
    });

    it("NIEGA a un voluntario ASIGNADO a ese evento — no modera el mural", async () => {
      const env = await getTestEnv();
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      await seedPhoto("p");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(getDoc(doc(vol, `${PHOTOS_A}/p`)));
      await assertFails(getDocs(collection(vol, PHOTOS_A)));
    });

    it("NIEGA a un member y a un contributor", async () => {
      const env = await getTestEnv();
      await seedUser("mem-1", { role: "member" });
      await seedUser("col-1", { role: "contributor" });
      await seedPhoto("p");
      for (const uid of ["mem-1", "col-1"]) {
        const db = env.authenticatedContext(uid).firestore();
        await assertFails(getDoc(doc(db, `${PHOTOS_A}/p`)));
      }
    });

    it("un organizador modera cualquier evento, no solo los suyos", async () => {
      const env = await getTestEnv();
      await seedUser("org-1", { role: "organizer" });
      await seedPhoto("p", {}, EVENT_B);
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(org, `events/${EVENT_B}/muralPhotos/p`)));
    });

    it("NIEGA a un organizador suspendido", async () => {
      const env = await getTestEnv();
      await seedUser("org-1", { role: "organizer", status: "suspended" });
      await seedPhoto("p");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(getDoc(doc(org, `${PHOTOS_A}/p`)));
    });

    it("NIEGA a un organizador con mural:moderate revocado", async () => {
      const env = await getTestEnv();
      await seedUser("org-1", {
        role: "organizer",
        revocations: ["mural:moderate"],
      });
      await seedPhoto("p");
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(getDoc(doc(org, `${PHOTOS_A}/p`)));
    });
  });

  describe("escritura: ninguna desde el cliente", () => {
    it("NIEGA crear, editar y borrar a un anónimo", async () => {
      const env = await getTestEnv();
      await seedPhoto("p");
      const anon = env.authenticatedContext(OTHER).firestore();
      await assertFails(
        setDoc(doc(anon, `${PHOTOS_A}/nueva`), { status: "approved" })
      );
      await assertFails(
        updateDoc(doc(anon, `${PHOTOS_A}/p`), { status: "approved" })
      );
      await assertFails(deleteDoc(doc(anon, `${PHOTOS_A}/p`)));
    });

    it("NIEGA al autor aprobar su propia foto", async () => {
      const env = await getTestEnv();
      await seedPhoto("mia");
      const author = env.authenticatedContext(AUTHOR).firestore();
      await assertFails(
        updateDoc(doc(author, `${PHOTOS_A}/mia`), { status: "approved" })
      );
    });

    it("NIEGA escribir incluso a un admin", async () => {
      const env = await getTestEnv();
      await seedUser("admin-1", { role: "admin" });
      await seedPhoto("p");
      const admin = env.authenticatedContext("admin-1").firestore();
      await assertFails(
        updateDoc(doc(admin, `${PHOTOS_A}/p`), { status: "approved" })
      );
      await assertFails(deleteDoc(doc(admin, `${PHOTOS_A}/p`)));
    });
  });

  describe("muralMeta", () => {
    it("es legible sin sesión — la página de subida necesita saber si está abierto", async () => {
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), SETTINGS_A), {
          state: "open",
          maxPerUid: 10,
          maxTotal: 1500,
          acceptedTotal: 3,
        });
      });
      const anon = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(anon, SETTINGS_A)));
    });

    it("NIEGA escribirlo a cualquiera, admin incluido — ahí vive el techo de coste", async () => {
      const env = await getTestEnv();
      await seedUser("admin-1", { role: "admin" });
      const admin = env.authenticatedContext("admin-1").firestore();
      const anon = env.authenticatedContext(OTHER).firestore();
      await assertFails(setDoc(doc(admin, SETTINGS_A), { maxTotal: 999999 }));
      await assertFails(setDoc(doc(anon, SETTINGS_A), { state: "open" }));
    });
  });

  describe("muralUploaders", () => {
    it("no es ni legible ni escribible, tampoco por un admin", async () => {
      const env = await getTestEnv();
      await seedUser("admin-1", { role: "admin" });
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `events/${EVENT_A}/muralUploaders/${AUTHOR}`),
          { uid: AUTHOR, uploadedCount: 4, blocked: false }
        );
      });
      const path = `events/${EVENT_A}/muralUploaders/${AUTHOR}`;
      const admin = env.authenticatedContext("admin-1").firestore();
      const author = env.authenticatedContext(AUTHOR).firestore();
      await assertFails(getDoc(doc(admin, path)));

      await assertFails(getDoc(doc(author, path)));
      await assertFails(updateDoc(doc(author, path), { uploadedCount: 0 }));
    });
  });
});

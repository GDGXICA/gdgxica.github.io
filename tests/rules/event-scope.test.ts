import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const EVENT_A = "devfest-ica-2026";
const EVENT_B = "build-with-ai-2026";
const ATTENDEE_A = `events/${EVENT_A}/roster/t_A1`;
const ATTENDEE_B = `events/${EVENT_B}/roster/t_B1`;

async function seedUser(uid: string, data: Record<string, unknown>) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, ...data });
  });
}

async function seedStaff(
  slug: string,
  uid: string,
  data: Record<string, unknown> = {}
) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `events/${slug}/staff/${uid}`), {
      assignedBy: "admin-1",
      ...data,
    });
  });
}

async function seedAttendee(path: string) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), {
      firstName: "Alex",
      lastName: "Quintanilla",
      email: "persona@example.com",
      checkedIn: false,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByName: null,
      note: null,
    });
  });
}

/** Un futuro/pasado relativo, para asignaciones con caducidad. */
const inAnHour = () => new Date(Date.now() + 3_600_000);
const anHourAgo = () => new Date(Date.now() - 3_600_000);

describe("alcance por evento", () => {
  beforeAll(async () => {
    await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("roster de un voluntario", () => {
    it("lee el roster del evento donde está asignado", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertSucceeds(getDoc(doc(vol, ATTENDEE_A)));
    });

    // Este es el agujero que motivó todo el cambio: antes `isOrganizer()`
    // abría el roster de CUALQUIER evento a quien tuviera el rol.
    it("NO lee el roster de un evento donde no está asignado", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_B);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(getDoc(doc(vol, ATTENDEE_B)));
    });

    it("no lee nada si no tiene ninguna asignación", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer" });
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(getDoc(doc(vol, ATTENDEE_A)));
    });

    it("deja de leer cuando la asignación caduca", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1", { expiresAt: anHourAgo() });
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(getDoc(doc(vol, ATTENDEE_A)));
    });

    it("lee mientras la asignación siga vigente", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1", { expiresAt: inAnHour() });
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertSucceeds(getDoc(doc(vol, ATTENDEE_A)));
    });
  });

  describe("check-in de un voluntario", () => {
    it("marca asistencia en su evento", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertSucceeds(
        updateDoc(doc(vol, ATTENDEE_A), {
          checkedIn: true,
          checkedInBy: "vol-1",
        })
      );
    });

    it("NO marca asistencia en otro evento", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_B);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(
        updateDoc(doc(vol, ATTENDEE_B), {
          checkedIn: true,
          checkedInBy: "vol-1",
        })
      );
    });

    it("sigue sin poder reescribir el email del asistente", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(
        updateDoc(doc(vol, ATTENDEE_A), { email: "otro@example.com" })
      );
    });
  });

  describe("organizador y admin conservan el alcance global", () => {
    it("un organizador lee cualquier roster sin estar asignado", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_B);
      await seedUser("org-1", { role: "organizer" });
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(org, ATTENDEE_B)));
    });

    it("un admin también", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_B);
      await seedUser("adm-1", { role: "admin" });
      const adm = env.authenticatedContext("adm-1").firestore();
      await assertSucceeds(getDoc(doc(adm, ATTENDEE_B)));
    });
  });

  describe("suspensión", () => {
    it("un organizador suspendido pierde el acceso al roster", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("org-1", { role: "organizer", status: "suspended" });
      const org = env.authenticatedContext("org-1").firestore();
      await assertFails(getDoc(doc(org, ATTENDEE_A)));
    });

    it("un voluntario suspendido pierde el acceso pese a estar asignado", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("vol-1", { role: "volunteer", status: "suspended" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(getDoc(doc(vol, ATTENDEE_A)));
    });

    it("un doc sin status se sigue tratando como activo", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("org-1", { role: "organizer" });
      const org = env.authenticatedContext("org-1").firestore();
      await assertSucceeds(getDoc(doc(org, ATTENDEE_A)));
    });
  });

  describe("colaborador externo", () => {
    it("no llega al roster de ningún evento", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("ext-1", { role: "contributor" });
      const ext = env.authenticatedContext("ext-1").firestore();
      await assertFails(getDoc(doc(ext, ATTENDEE_A)));
    });

    it("tampoco estando asignado como staff: no es su bundle", async () => {
      const env = await getTestEnv();
      await seedAttendee(ATTENDEE_A);
      await seedUser("ext-1", { role: "contributor" });
      await seedStaff(EVENT_A, "ext-1");
      const ext = env.authenticatedContext("ext-1").firestore();
      await assertFails(getDoc(doc(ext, ATTENDEE_A)));
    });
  });

  describe("docs de asignación", () => {
    it("la persona ve su propia asignación", async () => {
      const env = await getTestEnv();
      await seedUser("vol-1", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-1");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertSucceeds(getDoc(doc(vol, `events/${EVENT_A}/staff/vol-1`)));
    });

    it("no ve la asignación de otra persona", async () => {
      const env = await getTestEnv();
      await seedUser("vol-1", { role: "volunteer" });
      await seedUser("vol-2", { role: "volunteer" });
      await seedStaff(EVENT_A, "vol-2");
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(getDoc(doc(vol, `events/${EVENT_A}/staff/vol-2`)));
    });

    it("nadie puede autoasignarse staff desde el cliente", async () => {
      const env = await getTestEnv();
      await seedUser("vol-1", { role: "volunteer" });
      const vol = env.authenticatedContext("vol-1").firestore();
      await assertFails(
        setDoc(doc(vol, `events/${EVENT_A}/staff/vol-1`), {
          assignedBy: "vol-1",
        })
      );
    });

    it("ni siquiera un admin escribe asignaciones desde el cliente", async () => {
      const env = await getTestEnv();
      await seedUser("adm-1", { role: "admin" });
      const adm = env.authenticatedContext("adm-1").firestore();
      await assertFails(
        setDoc(doc(adm, `events/${EVENT_A}/staff/adm-1`), {
          assignedBy: "adm-1",
        })
      );
    });

    it("las asignaciones no son públicas", async () => {
      const env = await getTestEnv();
      await seedStaff(EVENT_A, "vol-1");
      const anon = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, `events/${EVENT_A}/staff/vol-1`)));
    });
  });

  describe("autoalta de usuario", () => {
    it("permite crearse como member sin privilegios", async () => {
      const env = await getTestEnv();
      const nuevo = env.authenticatedContext("new-1").firestore();
      await assertSucceeds(
        setDoc(doc(nuevo, "users/new-1"), {
          uid: "new-1",
          role: "member",
          status: "active",
          grants: [],
          revocations: [],
        })
      );
    });

    // Sin esta comprobación, cualquiera podría darse de alta como `member`
    // y concederse en el mismo write los permisos que quisiera, porque los
    // grants suman por encima del rol.
    it("RECHAZA autoconcederse grants en el alta", async () => {
      const env = await getTestEnv();
      const atacante = env.authenticatedContext("evil-1").firestore();
      await assertFails(
        setDoc(doc(atacante, "users/evil-1"), {
          uid: "evil-1",
          role: "member",
          grants: [{ permission: "users:role:write", scope: "*" }],
        })
      );
    });

    it("RECHAZA autoconcederse revocations", async () => {
      const env = await getTestEnv();
      const atacante = env.authenticatedContext("evil-2").firestore();
      await assertFails(
        setDoc(doc(atacante, "users/evil-2"), {
          uid: "evil-2",
          role: "member",
          revocations: ["audit:read"],
        })
      );
    });

    it("RECHAZA autoasignarse un rol distinto de member", async () => {
      const env = await getTestEnv();
      const atacante = env.authenticatedContext("evil-3").firestore();
      await assertFails(
        setDoc(doc(atacante, "users/evil-3"), {
          uid: "evil-3",
          role: "admin",
        })
      );
    });

    it("RECHAZA crearse ya suspendido/con status manipulado", async () => {
      const env = await getTestEnv();
      const atacante = env.authenticatedContext("evil-4").firestore();
      await assertFails(
        setDoc(doc(atacante, "users/evil-4"), {
          uid: "evil-4",
          role: "member",
          status: "superactive",
        })
      );
    });
  });
});

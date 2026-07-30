import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ writeAuditLog: vi.fn() }));

vi.mock("../utils/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

// Stub del SDK v2 para que importar el módulo no exija configuración de
// runtime. Los tests atacan el handler interno, no el export envuelto.
vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: (_path: string, handler: unknown) => handler,
}));

import { auditCheckinFromEvent, type RosterWriteEvent } from "./auditCheckin";

const SLUG = "devfest-ica-2026";
const ATTENDEE = "t_GOOGA263171317";

/** Construye el evento con la forma que entrega Firestore. */
function writeEvent(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): RosterWriteEvent {
  return {
    data: {
      before: {
        exists: before !== null,
        data: () => before ?? undefined,
      },
      after: {
        exists: after !== null,
        data: () => after ?? undefined,
      },
    },
    params: { slug: SLUG, attendeeId: ATTENDEE },
  } as RosterWriteEvent;
}

beforeEach(() => {
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

describe("auditCheckinFromEvent", () => {
  describe("registra el cambio de asistencia", () => {
    it("marca presente", async () => {
      await auditCheckinFromEvent(
        writeEvent(
          { checkedIn: false },
          { checkedIn: true, lastActionBy: "vol-1", lastActionByName: "Ana" }
        )
      );

      expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
      expect(mocks.writeAuditLog).toHaveBeenCalledWith({
        action: "checkin.mark",
        performedBy: "vol-1",
        targetId: ATTENDEE,
        targetType: "roster_attendee",
        details: { eventSlug: SLUG, checkedIn: true, actorName: "Ana" },
      });
    });

    // El caso que motivó todo esto: desmarcar limpia `checkedInBy`, así que
    // antes marcar y desmarcar no dejaba constancia de nadie en ninguna parte.
    it("desmarca, y sigue diciendo quién lo hizo", async () => {
      await auditCheckinFromEvent(
        writeEvent(
          { checkedIn: true, lastActionBy: "vol-1" },
          {
            checkedIn: false,
            checkedInBy: null,
            lastActionBy: "org-9",
            lastActionByName: "Alvaro",
          }
        )
      );

      expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
      expect(mocks.writeAuditLog.mock.calls[0][0]).toMatchObject({
        action: "checkin.unmark",
        performedBy: "org-9",
        details: { checkedIn: false, actorName: "Alvaro" },
      });
    });

    // La importación no escribe campos de check-in, ni siquiera a false, así
    // que la primera vez que alguien marca presente el campo se AÑADE.
    it("trata la ausencia previa del campo como 'no había llegado'", async () => {
      await auditCheckinFromEvent(
        writeEvent(
          { ticketNumber: "GOOGA263171317" },
          { ticketNumber: "GOOGA263171317", checkedIn: true, lastActionBy: "v" }
        )
      );

      expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
      expect(mocks.writeAuditLog.mock.calls[0][0]).toMatchObject({
        action: "checkin.mark",
      });
    });
  });

  describe("no registra lo que no es un cambio de asistencia", () => {
    // El caso de volumen: importar un CSV de trescientas filas reescribe todas
    // sin tocar el check-in. Sin este corte, cada importación ahogaría el
    // registro con trescientas entradas que no cuentan nada.
    it("ignora una importación que no toca el check-in", async () => {
      await auditCheckinFromEvent(
        writeEvent(
          { checkedIn: true, email: "viejo@x.com", lastActionBy: "vol-1" },
          { checkedIn: true, email: "nuevo@x.com", lastActionBy: "vol-1" }
        )
      );

      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it("ignora una creación sin check-in (fila recién importada)", async () => {
      await auditCheckinFromEvent(
        writeEvent(null, { ticketNumber: "GOOGA263171317", email: "a@b.com" })
      );

      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it("ignora una nota añadida sin cambiar la asistencia", async () => {
      await auditCheckinFromEvent(
        writeEvent(
          { checkedIn: false },
          { checkedIn: false, note: "vino sin entrada", lastActionBy: "org-1" }
        )
      );

      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it("ignora el borrado del documento", async () => {
      await auditCheckinFromEvent(
        writeEvent({ checkedIn: true, lastActionBy: "vol-1" }, null)
      );

      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("atribución degradada", () => {
    // Las reglas garantizan `lastActionBy` en toda escritura del cliente, pero
    // el Admin SDK se las salta y las filas anteriores a esa regla no lo
    // tienen. Vale más una entrada que diga "no se sabe quién" que ninguna.
    it("cae a 'unknown' cuando falta el actor", async () => {
      await auditCheckinFromEvent(
        writeEvent({ checkedIn: false }, { checkedIn: true })
      );

      expect(mocks.writeAuditLog.mock.calls[0][0]).toMatchObject({
        performedBy: "unknown",
        details: { actorName: null },
      });
    });

    it("cae a 'unknown' cuando el actor no es una cadena usable", async () => {
      await auditCheckinFromEvent(
        writeEvent({ checkedIn: false }, { checkedIn: true, lastActionBy: 42 })
      );

      expect(mocks.writeAuditLog.mock.calls[0][0]).toMatchObject({
        performedBy: "unknown",
      });
    });
  });
});

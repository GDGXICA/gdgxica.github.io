import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { writeAuditLog } from "../utils/audit";

/**
 * Audita el check-in de asistentes.
 *
 * Marcar asistencia es la ÚNICA mutación del panel que no pasa por la API: los
 * voluntarios escriben directamente en Firestore para que la escritura se
 * encole en la caché local y se reproduzca cuando el wifi del recinto vuelve.
 * Esa decisión es correcta —en la puerta de un evento es la diferencia entre
 * que el check-in funcione o no— pero dejaba la acción fuera del registro:
 * `writeAuditLog` vive en la API, y aquí no hay petición que interceptar.
 *
 * De ahí un trigger. Es la única forma de instrumentar una escritura directa
 * sin quitarle al panel lo que lo hace usable sin conexión.
 *
 * Un trigger de Firestore NO lleva contexto de autenticación, así que no puede
 * saber por su cuenta quién escribió. Por eso el actor viaja en el propio
 * documento (`lastActionBy`), y las reglas exigen que coincida con el uid de
 * quien escribe. Ver el bloque `roster` en firestore.rules.
 *
 * Coste: una invocación por ESCRITURA en el roster, no por cambio de estado.
 * Un trigger de Firestore no se puede filtrar en el servidor, así que importar
 * un CSV de trescientas filas son trescientas invocaciones que salen por el
 * `return` de abajo sin escribir nada. Es el precio de instrumentar una
 * escritura directa, y a escala de un DevFest —unos cientos de filas por
 * evento, unas pocas importaciones— entra de sobra en el nivel gratuito. Si
 * algún día el roster fuera de decenas de miles, esto habría que replantearlo.
 */

/** Lo mínimo del evento de Firestore que necesita el handler. */
export interface RosterWriteEvent {
  data?: {
    before?: { exists: boolean; data: () => RosterDoc | undefined };
    after?: { exists: boolean; data: () => RosterDoc | undefined };
  };
  params: { slug: string; attendeeId: string };
}

interface RosterDoc {
  checkedIn?: unknown;
  lastActionBy?: unknown;
  lastActionByName?: unknown;
}

/**
 * `true` solo si el documento dice explícitamente que la persona está presente.
 *
 * La importación no escribe campos de check-in en absoluto —ni siquiera a
 * `false`, ver `handlers/checkin.ts`— así que la ausencia es el estado normal
 * de una fila recién importada y tiene que leerse como "no ha llegado".
 */
function isCheckedIn(doc: RosterDoc | undefined): boolean {
  return doc?.checkedIn === true;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Handler interno, exportado aparte para poder dirigirlo con un evento
 * sintético en los tests sin levantar el emulador. Mismo patrón que
 * `recomputeAggregates.ts`.
 */
export async function auditCheckinFromEvent(
  event: RosterWriteEvent
): Promise<void> {
  const after = event.data?.after;

  // Borrado. Las reglas ya lo prohíben desde el cliente, y una importación
  // tampoco borra nunca (los asistentes que desaparecen del CSV se marcan,
  // no se eliminan), así que llegar aquí significa una limpieza deliberada
  // con el Admin SDK. No es un cambio de asistencia y no se registra como tal.
  if (!after?.exists) return;

  const beforeDoc = event.data?.before?.exists
    ? event.data.before.data()
    : undefined;
  const afterDoc = after.data();

  const was = isCheckedIn(beforeDoc);
  const now = isCheckedIn(afterDoc);

  // El grueso de las escrituras del roster son importaciones, que reescriben
  // los datos del asistente sin tocar el check-in. Solo interesa el cambio de
  // estado: sin esto, importar un CSV de trescientas filas generaría
  // trescientas entradas que no cuentan nada.
  if (was === now) return;

  const { slug, attendeeId } = event.params;

  await writeAuditLog({
    action: now ? "checkin.mark" : "checkin.unmark",
    // Las reglas garantizan que este campo existe y que es el uid de quien
    // escribió. El fallback cubre las filas anteriores a esa regla y cualquier
    // escritura hecha con el Admin SDK, que sí se salta las reglas.
    performedBy: asString(afterDoc?.lastActionBy) ?? "unknown",
    targetId: attendeeId,
    targetType: "roster_attendee",
    // Sin datos personales: el registro lo lee gente distinta de la que puede
    // ver el roster, y el id del documento basta para seguir el rastro. Mismo
    // criterio que en `handlers/credentials.ts`.
    details: {
      eventSlug: slug,
      checkedIn: now,
      actorName: asString(afterDoc?.lastActionByName),
    },
  });
}

export const onRosterCheckinWritten = onDocumentWritten(
  "events/{slug}/roster/{attendeeId}",
  // Cast en el punto de llamada para conservar el tipo fuerte del SDK v2 de
  // cara al despliegue sin arrastrarlo al shape interno que usan los tests.
  (event) => auditCheckinFromEvent(event as unknown as RosterWriteEvent)
);

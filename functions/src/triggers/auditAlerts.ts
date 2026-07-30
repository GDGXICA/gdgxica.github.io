import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  RESEND_API_KEY,
  RESEND_FROM,
  SITE_ORIGIN,
} from "../config";
import { sendAuditAlertEmail } from "../services/email";
import { NOTABLE_SEVERITIES } from "../utils/auditTypes";

/**
 * A quién se avisa. La misma dirección de contacto del resto de la plataforma:
 * quien recibe esto es quien la administra.
 */
const ALERT_TO = "aalvaropc@gmail.com";

/** Documento donde vive la marca de agua. */
const STATE_DOC = "settings/auditAlerts";

/**
 * Cuántos eventos se detallan en el correo. El total real siempre se dice,
 * aunque la lista se recorte: un correo con doscientas líneas no se lee, y uno
 * que oculta que hubo doscientas miente.
 */
const MAX_DETAILED = 25;

/** Techo de la consulta, para que una ráfaga no traiga la colección entera. */
const QUERY_LIMIT = 200;

/**
 * Cuántas acciones distintas se resumen. Los `warning` van agregados por
 * acción, así que esto acota la tabla del resumen, no cuántos eventos cuenta.
 */
const MAX_SUMMARY_ROWS = 15;

/**
 * Primera ejecución: sin marca de agua, se mira solo la última hora en vez de
 * todo el histórico. Arrancar avisando de cada cosa que pasó desde el principio
 * de los tiempos garantiza que el primer correo se ignore.
 */
const FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000;

interface AuditRow {
  action?: string;
  severity?: string;
  performedBy?: string;
  synthesized?: boolean;
  timestamp?: Timestamp;
  context?: { ipPrefix?: string | null };
}

/**
 * Avisa por correo de lo que hay que mirar en el registro de auditoría.
 *
 * Sin esto, todo el trabajo de instrumentación solo sirve si alguien se acuerda
 * de abrir el panel. Un registro que nadie lee no detecta nada; lo que convierte
 * la auditoría en una defensa es que te busque a ti y no al contrario.
 *
 * Se apoya en `severity`, no en una lista de acciones. Cualquier acción futura
 * que se marque como notable entra en las alertas sin tocar este archivo — y al
 * revés, subir la severidad de algo es una decisión con consecuencia visible.
 *
 * Mira `warning` además de `critical`, y esa es la razón de ser de este
 * diseño. Solo dos cosas llegan a `critical`: una cuenta suspendida que sigue
 * intentando operar, y el propio registro estrangulándose. Lo que de verdad
 * delata a alguien probando qué puede tocar —`security.permission.denied`— es
 * `warning`, igual que las filas `synthesized` que significan "aquí hay código
 * mutando cosas sin decir qué". Avisando solo de lo crítico, una tarde entera
 * de sondeo no generaba ni un correo.
 *
 * Para que ampliarlo no convierta el aviso en ruido, los dos niveles se tratan
 * distinto: lo crítico se detalla evento a evento, y los `warning` van
 * agregados por acción con su cuenta. Un correo de doscientas líneas se lee
 * como spam y se empieza a ignorar justo cuando importa.
 */
export const auditAlerts = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "America/Lima",
    // Una función programada declara sus propios secretos: el array del
    // `onRequest` de la API no se extiende hasta aquí, y omitirlos falla al
    // enviar —con una contraseña vacía— en vez de al desplegar.
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, RESEND_API_KEY, RESEND_FROM],
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const stateRef = db.doc(STATE_DOC);
    const stateSnap = await stateRef.get();

    const lastChecked = stateSnap.data()?.lastCheckedAt as
      Timestamp | undefined;
    const since = lastChecked
      ? lastChecked.toDate()
      : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);

    // La ventana se cierra ANTES de consultar. Si se cerrara después, todo lo
    // escrito mientras corre la consulta caería en el hueco entre esta ejecución
    // y la siguiente, y no se avisaría de ello nunca.
    const windowEnd = new Date();

    const snapshot = await db
      .collection("audit_log")
      .where("severity", "in", NOTABLE_SEVERITIES)
      .orderBy("timestamp", "desc")
      .limit(QUERY_LIMIT)
      .get();

    // El filtro por fecha se aplica en memoria: combinarlo con el `where` de
    // severidad exigiría otro índice compuesto, y la consulta ya viene ordenada
    // y acotada a 200.
    const fresh = snapshot.docs
      .map((d) => d.data() as AuditRow)
      .filter((row) => {
        const at = row.timestamp?.toDate?.();
        if (!at) return false;
        return at > since && at <= windowEnd;
      });

    // Si la consulta llegó al techo Y todo lo que trajo cae dentro de la
    // ventana, es que había más por debajo que el `limit` cortó: no sabemos
    // cuántos eventos hubo, solo que fueron al menos estos.
    //
    // Decirlo importa porque la marca de agua avanza igual, así que lo que se
    // quedó fuera no se avisa nunca. Antes el correo daba ese recuento como si
    // fuera el total, que es precisamente mentir en la ráfaga — el momento en
    // que el número real es el dato que hace falta.
    const truncated =
      snapshot.docs.length === QUERY_LIMIT &&
      fresh.length === snapshot.docs.length;

    // La marca de agua avanza SIEMPRE, incluso sin nada que avisar. Si solo
    // avanzara al mandar correo, una hora tranquila dejaría la ventana abierta
    // y la siguiente ejecución volvería a mirar lo mismo.
    await stateRef.set(
      { lastCheckedAt: Timestamp.fromDate(windowEnd) },
      { merge: true }
    );

    if (fresh.length === 0) return;

    // Lo crítico se detalla; los `warning` se agregan. Provocar un `warning` es
    // barato —basta con tantear un endpoint— así que detallarlos uno a uno
    // dejaría que quien sondea decidiera la longitud del correo.
    const criticals = fresh.filter((row) => row.severity === "critical");
    const warnings = fresh.filter((row) => row.severity !== "critical");

    const events = criticals.slice(0, MAX_DETAILED).map((row) => ({
      action: row.action ?? "(sin acción)",
      severity: row.severity ?? "critical",
      performedBy: row.performedBy ?? "(desconocido)",
      ipPrefix: row.context?.ipPrefix ?? null,
      at: row.timestamp?.toDate?.() ?? null,
    }));

    const byAction = new Map<string, number>();
    for (const row of warnings) {
      const action = row.action ?? "(sin acción)";
      byAction.set(action, (byAction.get(action) ?? 0) + 1);
    }
    const warningSummary = [...byAction.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_SUMMARY_ROWS);

    try {
      await sendAuditAlertEmail({
        to: ALERT_TO,
        since,
        events,
        warningSummary,
        warningTotal: warnings.length,
        // Cuántas acciones DISTINTAS hubo, no cuántas se enseñan. El resumen
        // se recorta a `MAX_SUMMARY_ROWS`, y sin este número el correo callaba
        // que había recortado — la misma omisión silenciosa que este cambio
        // corrige en el total.
        warningActionCount: byAction.size,
        total: fresh.length,
        truncated,
        // `notable` y no `critical`: el enlace tiene que enseñar lo mismo de lo
        // que avisa el correo. Filtrando por crítico, quien siguiera el enlace
        // tras un aviso de sondeo no encontraría ninguna de las filas que lo
        // habían motivado.
        panelUrl: `${SITE_ORIGIN}/admin/audit?severity=notable`,
      });
      logger.info("audit.alert.sent", {
        total: fresh.length,
        criticals: criticals.length,
        warnings: warnings.length,
        truncated,
        since: since.toISOString(),
      });
    } catch (err) {
      // La marca de agua ya avanzó, así que un fallo de correo pierde el aviso
      // de esta ventana. Se acepta a cambio de la idempotencia: reintentar
      // dejando la ventana abierta significaría que un problema persistente de
      // SMTP acumula filas y manda un correo enorme cuando se arregle. El
      // registro sigue completo en el panel, y este error queda en Cloud
      // Logging, que es donde se mira si las alertas dejan de llegar.
      logger.error("audit.alert.failed", { err, total: fresh.length });
    }
  }
);

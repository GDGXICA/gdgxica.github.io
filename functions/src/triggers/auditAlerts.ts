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
 * que se marque como `critical` entra en las alertas sin tocar este archivo — y
 * al revés, subir algo a `critical` es una decisión con consecuencia visible.
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
      .where("severity", "==", "critical")
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

    // La marca de agua avanza SIEMPRE, incluso sin nada que avisar. Si solo
    // avanzara al mandar correo, una hora tranquila dejaría la ventana abierta
    // y la siguiente ejecución volvería a mirar lo mismo.
    await stateRef.set(
      { lastCheckedAt: Timestamp.fromDate(windowEnd) },
      { merge: true }
    );

    if (fresh.length === 0) return;

    const events = fresh.slice(0, MAX_DETAILED).map((row) => ({
      action: row.action ?? "(sin acción)",
      severity: row.severity ?? "critical",
      performedBy: row.performedBy ?? "(desconocido)",
      ipPrefix: row.context?.ipPrefix ?? null,
      at: row.timestamp?.toDate?.() ?? null,
    }));

    try {
      await sendAuditAlertEmail({
        to: ALERT_TO,
        since,
        events,
        total: fresh.length,
        panelUrl: `${SITE_ORIGIN}/admin/audit?severity=critical`,
      });
      logger.info("audit.alert.sent", {
        total: fresh.length,
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

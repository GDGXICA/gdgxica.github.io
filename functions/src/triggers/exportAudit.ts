import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { google } from "googleapis";

/**
 * Copia mensual de `audit_log` fuera de Firestore.
 *
 * Para qué sirve exactamente: las reglas cierran la colección a los clientes,
 * pero el Admin SDK las salta. Cualquiera que comprometa el panel —o la propia
 * cuenta de servicio— puede borrar filas, y un registro que sus atacantes pueden
 * editar no prueba nada. Esta copia vive en un bucket distinto, con su propio
 * control de acceso, así que borrarla exige comprometer también eso.
 *
 * NO es el control principal de inmutabilidad. Ese es el log bucket de Cloud
 * Logging con `--locked`, que ni un owner del proyecto puede acortar ni borrar
 * (ver docs/auditoria.md). Esto es la segunda copia, y su ventaja sobre la de
 * Cloud Logging es que se puede reimportar a Firestore tal cual.
 *
 * Usa `googleapis`, que ya es dependencia directa, en vez del cliente de
 * administración de `@google-cloud/firestore`: ese último solo está disponible
 * como dependencia transitiva de `firebase-admin`, y depender de algo que no
 * está declarado se rompe el día que firebase-admin cambie de versión mayor.
 */

/** Se resuelve en tiempo de ejecución: en Cloud Functions siempre está puesta. */
function projectId(): string {
  return (
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    "appgdgica"
  );
}

/**
 * Bucket destino. Tiene que existir y la cuenta de servicio de la función
 * necesita permiso de escritura y el rol de export — los dos pasos están en
 * docs/auditoria.md, y sin ellos esto falla con un 403 que queda en el log.
 */
function bucketUri(): string {
  return `gs://${projectId()}-audit-backups`;
}

export const exportAudit = onSchedule(
  {
    // Día 1 de cada mes. Mensual y no diario porque el volumen de `audit_log`
    // es pequeño y cada export cobra por documento leído: la copia existe para
    // sobrevivir a un borrado, no para reconstruir el estado de ayer.
    schedule: "0 4 1 * *",
    timeZone: "America/Lima",
    timeoutSeconds: 540,
  },
  async () => {
    const project = projectId();
    const name = `projects/${project}/databases/(default)`;

    try {
      // La autenticación sale del entorno: la cuenta de servicio de la función.
      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/datastore"],
      });
      const firestore = google.firestore({ version: "v1", auth });

      const response = await firestore.projects.databases.exportDocuments({
        name,
        requestBody: {
          // Solo la colección de auditoría. Exportar la base entera arrastraría
          // las credenciales con datos personales a un bucket más, que es
          // exactamente lo contrario de lo que pide la política de retención.
          collectionIds: ["audit_log"],
          outputUriPrefix: bucketUri(),
        },
      });

      logger.info("audit.export.started", {
        operation: response.data.name,
        destination: bucketUri(),
      });
    } catch (err) {
      // No se relanza: un fallo aquí no debe marcar la ejecución programada como
      // caída y disparar reintentos que acumulen exports a medias. Queda en
      // Cloud Logging, que es donde se comprueba si las copias siguen saliendo.
      logger.error("audit.export.failed", { err, destination: bucketUri() });
    }
  }
);

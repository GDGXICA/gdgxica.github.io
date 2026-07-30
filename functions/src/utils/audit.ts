import type { Request } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  deriveCategory,
  deriveSeverity,
  type AuditActor,
  type AuditDetails,
  type AuditEntry,
} from "./auditTypes";
import type { AuditAction } from "./auditActions";

/** Documento tal y como queda en Firestore: sin huecos que el visor tenga que adivinar. */
type StoredAuditEntry = AuditEntry & {
  timestamp: FieldValue;
  outcome: NonNullable<AuditEntry["outcome"]>;
  category: NonNullable<AuditEntry["category"]>;
  severity: NonNullable<AuditEntry["severity"]>;
};

/**
 * Referencia con id ya asignado, para poder meter la escritura del registro en
 * la misma transacción o batch que la mutación que registra. Firestore asigna
 * el id en el cliente, así que reservarlo antes no cuesta una llamada.
 */
export function newAuditRef(): admin.firestore.DocumentReference {
  return admin.firestore().collection("audit_log").doc();
}

function readActor(req: Request | undefined): AuditActor | undefined {
  const user = (
    req as { user?: Partial<AuditActor> & { role?: unknown } } | undefined
  )?.user;
  if (!user?.uid) return undefined;
  return {
    uid: user.uid,
    email: user.email || null,
    role: typeof user.role === "string" ? user.role : null,
    scope: user.scope || "*",
  };
}

/**
 * Completa una entrada: sella la marca de tiempo si falta, deduce
 * `outcome`/`category`/`severity`, y adjunta actor y contexto de la petición
 * si se pasó `req`.
 *
 * Se expone aparte de `writeAuditLog` porque los sitios de control de acceso
 * escriben su entrada dentro de una transacción y necesitan el documento, no
 * la escritura.
 */
export function buildAuditEntry(
  entry: AuditEntry,
  req?: Request
): StoredAuditEntry {
  const outcome = entry.outcome ?? "success";
  const category = entry.category ?? deriveCategory(entry.action);
  const actor = entry.actor ?? readActor(req);
  const context = entry.context ?? req?.auditContext;

  return {
    ...entry,
    timestamp: entry.timestamp ?? FieldValue.serverTimestamp(),
    outcome,
    category,
    severity: entry.severity ?? deriveSeverity(category, outcome),
    // Se omiten en vez de guardarse como `undefined`: Firestore rechaza
    // `undefined` por defecto, así que dejarlos pasar convertiría una entrada
    // sin contexto en una escritura fallida.
    ...(actor ? { actor } : {}),
    ...(context ? { context } : {}),
  };
}

/**
 * Copia a Cloud Logging.
 *
 * Es la mitad del diseño, no un extra. La colección de Firestore la puede
 * borrar cualquiera que tenga el Admin SDK —incluido quien haya comprometido
 * el panel—, mientras que la service account de la función no puede tocar sus
 * propios logs. Aquí va además la IP COMPLETA: Firestore solo guarda el
 * prefijo de red porque `audit_log` lo lee cualquiera con `audit:read`, y
 * Cloud Logging tiene su propio control de acceso y su propia retención.
 *
 * Se emite antes de escribir en Firestore, para que un fallo de Firestore no
 * se lleve por delante también el registro.
 */
export function mirrorToCloudLogging(
  entry: StoredAuditEntry,
  req?: Request
): void {
  const payload = {
    action: entry.action,
    outcome: entry.outcome,
    category: entry.category,
    severity: entry.severity,
    performedBy: entry.performedBy,
    targetType: entry.targetType,
    targetId: entry.targetId,
    requestId: entry.context?.requestId,
    route: entry.context?.route,
    ip: req?.ip ?? null,
    actorRole: entry.actor?.role,
    synthesized: entry.synthesized === true,
  };

  if (entry.severity === "critical" || entry.severity === "warning") {
    logger.warn("audit", payload);
  } else {
    logger.info("audit", payload);
  }
}

/**
 * Fabrica un constructor de entradas con el `targetType` ya fijado.
 *
 * Sustituye a tres factorías `auditEntry()` idénticas que vivían copiadas en
 * `minigameTemplates`, `minigameWords` y `minigameInstances`. Está currificada
 * en vez de recibir `targetType` como quinto argumento porque cinco parámetros
 * posicionales del mismo tipo son un imán de bugs: basta intercambiar dos para
 * escribir un registro que compila y miente.
 *
 * El genérico `D` conserva el tipado de detalles propio de cada archivo. Esas
 * interfaces locales son las que impiden un typo en una CLAVE de `details`, así
 * que aplanarlas a `AuditDetails` para quitar la duplicación habría cambiado
 * una garantía por otra.
 */
export function auditEntryFor<D extends AuditDetails>(targetType: string) {
  return (
    action: AuditAction,
    performedBy: string,
    targetId: string,
    details: D
  ): AuditEntry => ({
    action,
    performedBy,
    targetId,
    targetType,
    details,
    // Sin `timestamp`: lo sella el escritor. Ponerlo aquí obligaba a importar
    // FieldValue en cada handler para repetir el mismo valor.
  });
}

/**
 * Lo mínimo que hace falta para dejar preparada la escritura: lo cumplen tanto
 * `WriteBatch` como `Transaction`, y así el mismo helper sirve para los dos.
 */
type AuditStager = {
  set(ref: admin.firestore.DocumentReference, data: StoredAuditEntry): unknown;
};

/**
 * Deja la entrada preparada en un batch o una transacción, para que se confirme
 * junto con la mutación que registra.
 *
 * Devuelve la entrada construida en vez de espejarla a Cloud Logging aquí: el
 * callback de una transacción se puede REINTENTAR, y espejar dentro dejaría una
 * línea por intento contando como hechos cosas que Firestore acabó
 * descartando. Quien llama espeja una sola vez cuando el commit ya salió bien.
 */
export function stageAuditLog(
  stager: AuditStager,
  entry: AuditEntry,
  req?: Request
): StoredAuditEntry {
  const stored = buildAuditEntry(entry, req);
  stager.set(newAuditRef(), stored);
  if (req) req.auditClaimed = true;
  return stored;
}

/**
 * Confirma un batch que ya lleva dentro su propia entrada de auditoría y
 * espeja a Cloud Logging solo si el commit salió bien.
 *
 * Aquí el espejo va DESPUÉS, al contrario que en `writeAuditLog`. La diferencia
 * es a qué se parece un fallo en cada caso: en el camino no atómico el registro
 * es lo único que hay y conviene emitirlo aunque Firestore falle; aquí el
 * registro y la mutación caen juntos, así que anunciar un cambio de rol que la
 * base rechazó sería peor que no anunciar nada.
 */
export async function commitWithAuditLog(
  batch: admin.firestore.WriteBatch,
  entry: AuditEntry,
  req?: Request
): Promise<void> {
  const stored = stageAuditLog(batch, entry, req);
  await batch.commit();
  mirrorToCloudLogging(stored, req);
}

export interface WriteAuditLogOptions {
  /**
   * Relanza el error en vez de tragárselo. Para cuando quien llama puede hacer
   * algo con el fallo — devolver un 500 y no fingir que la operación quedó
   * registrada.
   */
  critical?: boolean;
}

/**
 * Escribe una entrada de auditoría.
 *
 * Pasar `req` es lo que añade contexto (id de petición, ruta, prefijo de IP) y
 * marca la petición como auditada, para que la red de seguridad no genere
 * además una fila sintética. Es opcional porque el tipo tenía que aceptar tal
 * cual los call sites que ya existían.
 *
 * OJO con lo que esta función NO garantiza: si Firestore falla, se registra el
 * error y la operación que se estaba auditando sigue adelante como si nada.
 * Para un cambio de rol eso no vale —una elevación de permisos sin rastro es
 * exactamente el caso que la auditoría existe para cubrir—, y por eso esos
 * sitios no usan esta función: construyen la entrada con `buildAuditEntry` y la
 * confirman en la misma transacción que la mutación, de modo que o quedan las
 * dos o no queda ninguna.
 */
export async function writeAuditLog(
  entry: AuditEntry,
  req?: Request,
  opts?: WriteAuditLogOptions
): Promise<void> {
  const stored = buildAuditEntry(entry, req);

  if (req) req.auditClaimed = true;
  mirrorToCloudLogging(stored, req);

  try {
    await admin.firestore().collection("audit_log").add(stored);
  } catch (err) {
    logger.error("Failed to write audit log", {
      action: entry.action,
      requestId: stored.context?.requestId,
      err,
    });
    if (opts?.critical) throw err;
  }
}

/**
 * Triggers a site rebuild without blocking the response, logging a warning if
 * the dispatch fails instead of swallowing the error.
 */
export function triggerRebuildAndLog(github: {
  triggerRebuild: () => Promise<void>;
}): void {
  github.triggerRebuild().catch((err) => {
    logger.warn("Site rebuild trigger failed", err);
  });
}

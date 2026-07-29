import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { safeError } from "../middleware/validate";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Campos por los que se puede filtrar. Cada uno necesita su índice compuesto
 * con `timestamp` (ver firestore.indexes.json), así que la lista es cerrada
 * y solo se admite UN filtro a la vez: combinarlos multiplicaría los índices
 * sin que nadie los esté pidiendo.
 */
const FILTERABLE = ["action", "performedBy", "targetId"] as const;
type Filterable = (typeof FILTERABLE)[number];

function readLimit(raw: unknown): number {
  const parsed = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Lee el registro de auditoría. Hasta ahora los 15 handlers escribían aquí
 * pero nadie podía leerlo: las reglas cierran la colección y no había
 * endpoint, así que la rendición de cuentas existía en la base de datos y
 * era invisible para quien tenía que revisarla.
 */
export async function listAudit(req: Request, res: Response) {
  try {
    const db = admin.firestore();
    let query = db
      .collection("audit_log")
      .orderBy("timestamp", "desc") as FirebaseFirestore.Query;

    const active = FILTERABLE.filter(
      (field) => typeof req.query[field] === "string" && req.query[field]
    );

    if (active.length > 1) {
      res.status(400).json({
        success: false,
        error: `Use at most one filter at a time (${FILTERABLE.join(", ")})`,
      });
      return;
    }

    if (active.length === 1) {
      const field = active[0] as Filterable;
      query = query.where(field, "==", req.query[field] as string);
    }

    const limit = readLimit(req.query.limit);

    // Cursor por documento, no por marca de tiempo: dos entradas pueden
    // compartir `timestamp` (una operación que escribe varias), y paginar
    // por valor se saltaría entradas o las repetiría.
    const cursor = req.query.cursor;
    if (typeof cursor === "string" && cursor.length > 0) {
      const cursorDoc = await db.collection("audit_log").doc(cursor).get();
      if (!cursorDoc.exists) {
        res.status(400).json({ success: false, error: "Invalid cursor" });
        return;
      }
      query = query.startAfter(cursorDoc);
    }

    // Se pide uno de más para saber si hay página siguiente sin contar toda
    // la colección.
    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;

    res.json({
      success: true,
      data: {
        entries: docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

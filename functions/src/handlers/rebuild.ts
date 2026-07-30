import { Request, Response } from "express";
import { safeError } from "../middleware/validate";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

// In-memory debounce — survives within a warm function instance.
// A 60s window is enough to coalesce rapid bursts (e.g. an admin
// editing several events back-to-back) without delaying the next
// legitimate publish noticeably.
const REBUILD_DEBOUNCE_MS = 60_000;
let lastRebuildAt = 0;

export async function triggerRebuild(req: Request, res: Response) {
  const user = (req as AuthenticatedRequest).user;
  try {
    const now = Date.now();
    const elapsed = now - lastRebuildAt;
    if (elapsed < REBUILD_DEBOUNCE_MS) {
      const retryAfter = Math.ceil((REBUILD_DEBOUNCE_MS - elapsed) / 1000);
      // Se registra como `denied`, no como éxito: esta rama devuelve 202 y
      // NO despacha nada. Auditarla como un rebuild más haría que el registro
      // contara publicaciones que nunca ocurrieron, y quien lo lea después
      // buscaría en el sitio un cambio que no está.
      await writeAuditLog(
        {
          action: "site.rebuild",
          performedBy: user.uid,
          targetId: "site",
          targetType: "site",
          details: { debounced: true, retryAfter },
          outcome: "denied",
        },
        req
      );
      res
        .status(202)
        .json({ success: true, message: "Rebuild already queued", retryAfter });
      return;
    }
    lastRebuildAt = now;
    const github = new GitHubService(GITHUB_TOKEN.value());
    await github.triggerRebuild();

    // Después del despacho, no antes: publicar el sitio público es la acción
    // con más alcance del panel y pronto la tendrán varias personas.
    await writeAuditLog(
      {
        action: "site.rebuild",
        performedBy: user.uid,
        targetId: "site",
        targetType: "site",
        details: {},
      },
      req
    );

    res.json({ success: true, message: "Rebuild triggered" });
  } catch (err) {
    await writeAuditLog(
      {
        action: "site.rebuild",
        performedBy: user.uid,
        targetId: "site",
        targetType: "site",
        details: {},
        outcome: "failure",
      },
      req
    );
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

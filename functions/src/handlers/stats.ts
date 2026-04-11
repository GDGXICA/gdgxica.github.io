import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

export async function getStats(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } =
      await github.getFileContent<Record<string, unknown>>("about/stats.json");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateStats(req: Request, res: Response) {
  try {
    const stats = req.body;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { sha } =
      await github.getFileContent<Record<string, unknown>>("about/stats.json");

    const updated = {
      ...stats,
      updated_at: new Date().toISOString(),
    };

    await github.putFile(
      "about/stats.json",
      JSON.stringify(updated, null, 2),
      "fix(stats): update community stats",
      sha
    );

    await github.triggerRebuild();

    await admin.firestore().collection("audit_log").add({
      action: "stats.update",
      performedBy: user.uid,
      targetId: "stats",
      targetType: "stats",
      details: stats,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

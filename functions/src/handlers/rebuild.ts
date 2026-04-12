import { Request, Response } from "express";
import { safeError } from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

// In-memory debounce — survives within a warm function instance.
// A 60s window is enough to coalesce rapid bursts (e.g. an admin
// editing several events back-to-back) without delaying the next
// legitimate publish noticeably.
const REBUILD_DEBOUNCE_MS = 60_000;
let lastRebuildAt = 0;

export async function triggerRebuild(_req: Request, res: Response) {
  try {
    const now = Date.now();
    const elapsed = now - lastRebuildAt;
    if (elapsed < REBUILD_DEBOUNCE_MS) {
      const retryAfter = Math.ceil((REBUILD_DEBOUNCE_MS - elapsed) / 1000);
      res
        .status(202)
        .json({ success: true, message: "Rebuild already queued", retryAfter });
      return;
    }
    lastRebuildAt = now;
    const github = new GitHubService(GITHUB_TOKEN.value());
    await github.triggerRebuild();
    res.json({ success: true, message: "Rebuild triggered" });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

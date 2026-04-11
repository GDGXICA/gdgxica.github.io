import { Request, Response } from "express";
import { safeError } from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

export async function triggerRebuild(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    await github.triggerRebuild();
    res.json({ success: true, message: "Rebuild triggered" });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

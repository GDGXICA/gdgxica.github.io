import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

interface Speaker {
  id: string;
  name: string;
  bio: string;
  photo_url: string;
  company: string;
  role: string;
  topics: string[];
  social_links: Record<string, string>;
  talk_ids: string[];
}

export async function listSpeakers(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } = await github.getFileContent<Speaker[]>(
      "speakers/index.json"
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function addSpeaker(req: Request, res: Response) {
  try {
    const speaker = req.body as Speaker;
    if (!speaker.id || !speaker.name) {
      res
        .status(400)
        .json({ success: false, error: "Missing required fields: id, name" });
      return;
    }

    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Create individual speaker file
    await github.putFile(
      `speakers/${speaker.id}.json`,
      JSON.stringify(speaker, null, 2),
      `feat(speakers): add ${speaker.name}`
    );

    // Update index
    const { data: index, sha } = await github.getFileContent<Speaker[]>(
      "speakers/index.json"
    );
    index.push(speaker);
    await github.putFile(
      "speakers/index.json",
      JSON.stringify(index, null, 2),
      `feat(speakers): add ${speaker.name} to index`,
      sha
    );

    await github.triggerRebuild();

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "speaker.create",
        performedBy: user.uid,
        targetId: speaker.id,
        targetType: "speaker",
        details: { name: speaker.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, data: { id: speaker.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateSpeaker(req: Request, res: Response) {
  try {
    const speakerId = req.params.id as string;
    const updates = { ...req.body, id: speakerId } as Speaker;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Update individual file
    const { sha: fileSha } = await github.getFileContent<Speaker>(
      `speakers/${speakerId}.json`
    );
    await github.putFile(
      `speakers/${speakerId}.json`,
      JSON.stringify(updates, null, 2),
      `fix(speakers): update ${speakerId}`,
      fileSha
    );

    // Update index
    const { data: index, sha: indexSha } = await github.getFileContent<
      Speaker[]
    >("speakers/index.json");
    const updatedIndex = index.map((s) => (s.id === speakerId ? updates : s));
    await github.putFile(
      "speakers/index.json",
      JSON.stringify(updatedIndex, null, 2),
      `fix(speakers): update ${speakerId} in index`,
      indexSha
    );

    await github.triggerRebuild();

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "speaker.update",
        performedBy: user.uid,
        targetId: speakerId,
        targetType: "speaker",
        details: { name: updates.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true, data: { id: speakerId } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function deleteSpeaker(req: Request, res: Response) {
  try {
    const speakerId = req.params.id as string;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Delete individual file
    const { sha: fileSha } = await github.getFileContent<Speaker>(
      `speakers/${speakerId}.json`
    );
    await github.deleteFile(
      `speakers/${speakerId}.json`,
      `chore(speakers): delete ${speakerId}`,
      fileSha
    );

    // Remove from index
    const { data: index, sha: indexSha } = await github.getFileContent<
      Speaker[]
    >("speakers/index.json");
    const filtered = index.filter((s) => s.id !== speakerId);
    await github.putFile(
      "speakers/index.json",
      JSON.stringify(filtered, null, 2),
      `chore(speakers): remove ${speakerId} from index`,
      indexSha
    );

    await github.triggerRebuild();

    await admin.firestore().collection("audit_log").add({
      action: "speaker.delete",
      performedBy: user.uid,
      targetId: speakerId,
      targetType: "speaker",
      details: {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

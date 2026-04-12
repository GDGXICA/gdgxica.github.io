import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  safeError,
  validateUrl,
  validateMapEmbedUrl,
} from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

interface EventIndexEntry {
  id: string;
  title: string;
  description: string;
  date: string;
  end_time: string;
  venue: string;
  venue_address: string;
  venue_map_url: string;
  image_url: string;
  topics: string[];
  speaker_ids: string[];
  registration_url: string | null;
  materials: Record<string, string>;
  agenda: { time: string; title: string; speaker: string }[];
}

function validateEventUrls(
  event: Record<string, unknown>,
  res: Response
): boolean {
  const urlFields: Array<string | undefined> = [
    event.image_url as string,
    event.venue_map_url as string,
    event.registration_url as string,
  ];
  if (urlFields.some((url) => url && !validateUrl(url))) {
    res.status(400).json({ success: false, error: "Invalid URL format" });
    return false;
  }
  if (
    event.venue_map_embed &&
    !validateMapEmbedUrl(event.venue_map_embed as string)
  ) {
    res.status(400).json({
      success: false,
      error: "venue_map_embed must be a google.com/maps/... https URL",
    });
    return false;
  }
  return true;
}

function toIndexEntry(event: Record<string, unknown>): EventIndexEntry {
  return {
    id: event.id as string,
    title: event.title as string,
    description: event.description as string,
    date: event.date as string,
    end_time: event.end_time as string,
    venue: (event.venue as string) || "",
    venue_address: (event.venue_address as string) || "",
    venue_map_url: (event.venue_map_url as string) || "",
    image_url: (event.image_url as string) || "",
    topics: (event.topics as string[]) || [],
    speaker_ids: (event.speaker_ids as string[]) || [],
    registration_url: (event.registration_url as string) || null,
    materials: (event.materials as Record<string, string>) || {},
    agenda:
      (event.agenda as { time: string; title: string; speaker: string }[]) ||
      [],
  };
}

export async function listEvents(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } =
      await github.getFileContent<EventIndexEntry[]>("events/index.json");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function getEvent(req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } = await github.getFileContent<Record<string, unknown>>(
      `events/${req.params.id}.json`
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function createEvent(req: Request, res: Response) {
  try {
    const event = req.body;
    if (!event.id || !event.title || !event.date) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: id, title, date",
      });
      return;
    }

    if (!validateEventUrls(event, res)) return;

    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Create event file
    await github.putFile(
      `events/${event.id}.json`,
      JSON.stringify(event, null, 2),
      `feat(events): add ${event.id}`
    );

    // Update index.json
    const { data: index, sha: indexSha } =
      await github.getFileContent<EventIndexEntry[]>("events/index.json");
    index.push(toIndexEntry(event));
    await github.putFile(
      "events/index.json",
      JSON.stringify(index, null, 2),
      `feat(events): add ${event.id} to index`,
      indexSha
    );

    // Trigger rebuild
    github.triggerRebuild().catch(() => {});

    // Audit log
    admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "event.create",
        performedBy: user.uid,
        targetId: event.id,
        targetType: "event",
        details: { title: event.title },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, data: { id: event.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateEvent(req: Request, res: Response) {
  try {
    const eventId = req.params.id;
    const event = { ...req.body, id: eventId };

    if (!validateEventUrls(event, res)) return;

    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Get current file SHA
    const { sha: fileSha } = await github.getFileContent<
      Record<string, unknown>
    >(`events/${eventId}.json`);

    // Update event file
    await github.putFile(
      `events/${eventId}.json`,
      JSON.stringify(event, null, 2),
      `fix(events): update ${eventId}`,
      fileSha
    );

    // Update index.json
    const { data: index, sha: indexSha } =
      await github.getFileContent<EventIndexEntry[]>("events/index.json");
    const updatedIndex = index.map((e) =>
      e.id === eventId ? toIndexEntry(event) : e
    );
    await github.putFile(
      "events/index.json",
      JSON.stringify(updatedIndex, null, 2),
      `fix(events): update ${eventId} in index`,
      indexSha
    );

    github.triggerRebuild().catch(() => {});

    admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "event.update",
        performedBy: user.uid,
        targetId: eventId,
        targetType: "event",
        details: { title: event.title },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true, data: { id: eventId } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function deleteEvent(req: Request, res: Response) {
  try {
    const eventId = req.params.id;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    // Delete event file
    const { sha: fileSha } = await github.getFileContent<
      Record<string, unknown>
    >(`events/${eventId}.json`);
    await github.deleteFile(
      `events/${eventId}.json`,
      `chore(events): delete ${eventId}`,
      fileSha
    );

    // Remove from index
    const { data: index, sha: indexSha } =
      await github.getFileContent<EventIndexEntry[]>("events/index.json");
    const filtered = index.filter((e) => e.id !== eventId);
    await github.putFile(
      "events/index.json",
      JSON.stringify(filtered, null, 2),
      `chore(events): remove ${eventId} from index`,
      indexSha
    );

    github.triggerRebuild().catch(() => {});

    admin.firestore().collection("audit_log").add({
      action: "event.delete",
      performedBy: user.uid,
      targetId: eventId,
      targetType: "event",
      details: {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

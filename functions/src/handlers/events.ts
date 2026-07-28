import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog, triggerRebuildAndLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  safeError,
  validateUrl,
  validateMapEmbedUrl,
} from "../middleware/validate";
import { GitHubService } from "../services/github";
import {
  publishEvent,
  toEventIndexEntry,
  type EventIndexEntry,
} from "../services/publish";
import { GITHUB_TOKEN } from "../config";

function validateEventUrls(
  event: Record<string, unknown>,
  res: Response
): boolean {
  const urlFields: Array<string | undefined> = [
    event.image_url as string,
    event.venue_map_url as string,
    event.registration_url as string,
    event.whatsapp_group_link as string,
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

    // Fichero del evento + entrada en el índice. La escritura vive en
    // services/publish.ts porque la comparte con la publicación de una
    // propuesta aprobada.
    await publishEvent(github, event);

    // Trigger rebuild
    triggerRebuildAndLog(github);

    // Audit log
    await writeAuditLog({
      action: "event.create",
      performedBy: user.uid,
      targetId: event.id,
      targetType: "event",
      details: { title: event.title },
      timestamp: FieldValue.serverTimestamp(),
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
      e.id === eventId ? toEventIndexEntry(event) : e
    );
    await github.putFile(
      "events/index.json",
      JSON.stringify(updatedIndex, null, 2),
      `fix(events): update ${eventId} in index`,
      indexSha
    );

    triggerRebuildAndLog(github);

    await writeAuditLog({
      action: "event.update",
      performedBy: user.uid,
      targetId: eventId,
      targetType: "event",
      details: { title: event.title },
      timestamp: FieldValue.serverTimestamp(),
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

    triggerRebuildAndLog(github);

    await writeAuditLog({
      action: "event.delete",
      performedBy: user.uid,
      targetId: eventId,
      targetType: "event",
      details: {},
      timestamp: FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

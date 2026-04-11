import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError, validateUrl } from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

interface Sponsor {
  name: string;
  logo_url: string;
  url: string;
  sector: string;
  description: string;
  featured: boolean;
  id?: string;
  events_sponsored?: number;
  since_year?: number;
}

export async function listSponsors(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } = await github.getFileContent<Sponsor[]>(
      "about/partners.json"
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function addSponsor(req: Request, res: Response) {
  try {
    const sponsor = req.body as Sponsor;
    if (!sponsor.name) {
      res
        .status(400)
        .json({ success: false, error: "Missing required field: name" });
      return;
    }

    if (!validateUrl(sponsor.logo_url) || !validateUrl(sponsor.url)) {
      res.status(400).json({ success: false, error: "Invalid URL format" });
      return;
    }

    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: partners, sha } = await github.getFileContent<Sponsor[]>(
      "about/partners.json"
    );
    partners.push(sponsor);

    await github.putFile(
      "about/partners.json",
      JSON.stringify(partners, null, 2),
      `feat(sponsors): add ${sponsor.name}`,
      sha
    );

    await github.triggerRebuild();

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "sponsor.create",
        performedBy: user.uid,
        targetId: sponsor.name,
        targetType: "sponsor",
        details: { name: sponsor.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, data: { name: sponsor.name } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateSponsor(req: Request, res: Response) {
  try {
    const sponsorId = decodeURIComponent(req.params.id as string);
    const updates = req.body as Sponsor;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    if (!validateUrl(updates.logo_url) || !validateUrl(updates.url)) {
      res.status(400).json({ success: false, error: "Invalid URL format" });
      return;
    }

    const { data: partners, sha } = await github.getFileContent<Sponsor[]>(
      "about/partners.json"
    );

    const index = partners.findIndex((p) => p.name === sponsorId);
    if (index === -1) {
      res.status(404).json({ success: false, error: "Sponsor not found" });
      return;
    }

    partners[index] = updates;

    await github.putFile(
      "about/partners.json",
      JSON.stringify(partners, null, 2),
      `fix(sponsors): update ${updates.name}`,
      sha
    );

    await github.triggerRebuild();

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "sponsor.update",
        performedBy: user.uid,
        targetId: updates.name,
        targetType: "sponsor",
        details: { name: updates.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true, data: { name: updates.name } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function deleteSponsor(req: Request, res: Response) {
  try {
    const sponsorId = decodeURIComponent(req.params.id as string);
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: partners, sha } = await github.getFileContent<Sponsor[]>(
      "about/partners.json"
    );
    const filtered = partners.filter((p) => p.name !== sponsorId);

    if (filtered.length === partners.length) {
      res.status(404).json({ success: false, error: "Sponsor not found" });
      return;
    }

    await github.putFile(
      "about/partners.json",
      JSON.stringify(filtered, null, 2),
      `chore(sponsors): remove ${sponsorId}`,
      sha
    );

    await github.triggerRebuild();

    await admin.firestore().collection("audit_log").add({
      action: "sponsor.delete",
      performedBy: user.uid,
      targetId: sponsorId,
      targetType: "sponsor",
      details: {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

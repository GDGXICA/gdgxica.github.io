import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { GitHubService } from "../services/github";
import { GITHUB_TOKEN } from "../config";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  photo_url: string;
  bio: string;
  social_links: Record<string, string>;
  type: "organizer" | "member";
  tags?: string[];
  joined_date?: string;
  responsibilities?: string[];
}

export async function listTeam(_req: Request, res: Response) {
  try {
    const github = new GitHubService(GITHUB_TOKEN.value());
    const { data } =
      await github.getFileContent<TeamMember[]>("about/team.json");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function addTeamMember(req: Request, res: Response) {
  try {
    const member = req.body as TeamMember;
    if (!member.id || !member.name) {
      res
        .status(400)
        .json({ success: false, error: "Missing required fields: id, name" });
      return;
    }

    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: team, sha } =
      await github.getFileContent<TeamMember[]>("about/team.json");
    team.push(member);

    await github.putFile(
      "about/team.json",
      JSON.stringify(team, null, 2),
      `feat(team): add ${member.name}`,
      sha
    );

    await github.triggerRebuild();

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "team.create",
        performedBy: user.uid,
        targetId: member.id,
        targetType: "team",
        details: { name: member.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, data: { id: member.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function updateTeamMember(req: Request, res: Response) {
  try {
    const memberId = req.params.id as string;
    const updates = req.body as TeamMember;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: team, sha } =
      await github.getFileContent<TeamMember[]>("about/team.json");
    const index = team.findIndex((m) => m.id === memberId);
    if (index === -1) {
      res.status(404).json({ success: false, error: "Member not found" });
      return;
    }

    team[index] = { ...updates, id: memberId };

    await github.putFile(
      "about/team.json",
      JSON.stringify(team, null, 2),
      `fix(team): update ${memberId}`,
      sha
    );

    await github.triggerRebuild();

    await admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "team.update",
        performedBy: user.uid,
        targetId: memberId,
        targetType: "team",
        details: { name: updates.name },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true, data: { id: memberId } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

export async function deleteTeamMember(req: Request, res: Response) {
  try {
    const memberId = req.params.id as string;
    const github = new GitHubService(GITHUB_TOKEN.value());
    const user = (req as AuthenticatedRequest).user;

    const { data: team, sha } =
      await github.getFileContent<TeamMember[]>("about/team.json");
    const filtered = team.filter((m) => m.id !== memberId);

    if (filtered.length === team.length) {
      res.status(404).json({ success: false, error: "Member not found" });
      return;
    }

    await github.putFile(
      "about/team.json",
      JSON.stringify(filtered, null, 2),
      `chore(team): remove ${memberId}`,
      sha
    );

    await github.triggerRebuild();

    await admin.firestore().collection("audit_log").add({
      action: "team.delete",
      performedBy: user.uid,
      targetId: memberId,
      targetType: "team",
      details: {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

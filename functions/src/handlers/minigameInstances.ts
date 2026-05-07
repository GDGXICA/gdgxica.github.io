import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import type { MinigameTemplate, MinigameTemplateType } from "../schemas";

interface AuditDetails {
  slug?: string;
  type?: MinigameTemplateType;
  title?: string;
  state?: string;
  templateId?: string;
  fromIndex?: number;
  toIndex?: number;
}

function modeForType(type: MinigameTemplateType): "global" | "realtime" {
  return type === "poll" || type === "quiz" ? "realtime" : "global";
}

function auditEntry(
  action: string,
  performedBy: string,
  targetId: string,
  details: AuditDetails
) {
  return {
    action,
    performedBy,
    targetId,
    targetType: "minigame_instance",
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function eventDocRef(slug: string) {
  return admin.firestore().collection("events").doc(slug);
}

function instancesCol(slug: string) {
  return eventDocRef(slug).collection("minigames");
}

// GET /api/events/:slug/minigames
export async function list(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const snap = await instancesCol(slug)
      .orderBy("order", "asc")
      .orderBy("createdAt", "asc")
      .get();
    res.json({
      success: true,
      data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// POST /api/events/:slug/minigames  body: { templateId, order }
export async function attach(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const user = (req as AuthenticatedRequest).user;
    const { templateId, order } = req.body as {
      templateId: string;
      order: number;
    };

    const tplRef = admin
      .firestore()
      .collection("minigame_templates")
      .doc(templateId);
    const tplSnap = await tplRef.get();
    if (!tplSnap.exists) {
      res.status(404).json({ success: false, error: "Template not found" });
      return;
    }
    const tpl = tplSnap.data() as
      | (MinigameTemplate & { version?: number })
      | undefined;
    if (!tpl) {
      res.status(404).json({ success: false, error: "Template not found" });
      return;
    }

    // Lazily create the parent shadow doc so subcollection rules can match.
    // `merge: true` keeps any later admin-written fields safe.
    const eventRef = eventDocRef(slug);
    await eventRef.set(
      {
        slug,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const now = admin.firestore.FieldValue.serverTimestamp();
    const config = pickConfig(tpl);
    const baseInstance: Record<string, unknown> = {
      eventSlug: slug,
      templateId,
      templateVersion: tpl.version ?? 1,
      type: tpl.type,
      mode: modeForType(tpl.type),
      state: "scheduled",
      title: tpl.title,
      config,
      order,
      createdAt: now,
      createdBy: user.uid,
    };
    if (tpl.type === "quiz") {
      baseInstance.currentQuestionIndex = -1;
      baseInstance.currentQuestionStartedAt = null;
    }

    const ref = await instancesCol(slug).add(baseInstance);

    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry("minigame_instance.attach", user.uid, ref.id, {
          slug,
          type: tpl.type,
          title: tpl.title,
          templateId,
        })
      );

    res
      .status(201)
      .json({ success: true, data: { id: ref.id, type: tpl.type } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// PATCH /api/events/:slug/minigames/:id/state  body: { state }
export async function setState(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;
    const { state } = req.body as {
      state: "scheduled" | "live" | "closed";
    };

    const ref = instancesCol(slug).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Minigame instance not found" });
      return;
    }

    const update: Record<string, unknown> = { state };
    if (state === "live") {
      update.activatedAt = admin.firestore.FieldValue.serverTimestamp();
    } else if (state === "closed") {
      update.closedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await ref.update(update);

    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry(`minigame_instance.state.${state}`, user.uid, id, {
          slug,
          state,
        })
      );

    res.json({ success: true, data: { id, state } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// POST /api/events/:slug/minigames/:id/quiz/advance
export async function quizAdvance(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;

    const ref = instancesCol(slug).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Minigame instance not found" });
      return;
    }
    const data = snap.data() as
      | {
          type?: string;
          state?: string;
          currentQuestionIndex?: number;
          config?: { questions?: unknown[] };
        }
      | undefined;
    if (!data || data.type !== "quiz") {
      res.status(400).json({ success: false, error: "Not a quiz instance" });
      return;
    }
    if (data.state !== "live") {
      res
        .status(400)
        .json({ success: false, error: "Quiz must be live to advance" });
      return;
    }
    const questions = data.config?.questions ?? [];
    const fromIndex = data.currentQuestionIndex ?? -1;
    const toIndex = fromIndex + 1;
    if (toIndex >= questions.length) {
      res
        .status(400)
        .json({ success: false, error: "Already on last question" });
      return;
    }

    await ref.update({
      currentQuestionIndex: toIndex,
      currentQuestionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry("minigame_instance.quiz.advance", user.uid, id, {
          slug,
          fromIndex,
          toIndex,
        })
      );

    res.json({ success: true, data: { id, currentQuestionIndex: toIndex } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// DELETE /api/events/:slug/minigames/:id  (only when state == "scheduled")
export async function remove(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;
    const user = (req as AuthenticatedRequest).user;

    const ref = instancesCol(slug).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      res
        .status(404)
        .json({ success: false, error: "Minigame instance not found" });
      return;
    }
    const data = snap.data() as { state?: string; title?: string } | undefined;
    if (data?.state !== "scheduled") {
      res.status(409).json({
        success: false,
        error:
          "Only scheduled instances can be deleted. Close the game and leave it as historical record.",
      });
      return;
    }
    await ref.delete();

    admin
      .firestore()
      .collection("audit_log")
      .add(
        auditEntry("minigame_instance.delete", user.uid, id, {
          slug,
          title: data?.title,
        })
      );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// Strip server-managed wrapper fields so the snapshot inside the instance
// stays focused on the runtime config the participant overlay needs.
function pickConfig(tpl: MinigameTemplate): Record<string, unknown> {
  switch (tpl.type) {
    case "poll":
      return { ...tpl.poll };
    case "quiz":
      return { ...tpl.quiz };
    case "wordcloud":
      return { ...tpl.wordcloud };
    case "bingo":
      return { ...tpl.bingo };
  }
}

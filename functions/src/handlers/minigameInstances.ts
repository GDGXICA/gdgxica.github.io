import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { auditEntryFor, writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { ensureDrawOrder } from "../services/bingoDrawStore";
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

/** Entradas de este handler: `targetType` fijo, detalles tipados arriba. */
const auditEntry = auditEntryFor<AuditDetails>("minigame_instance");

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
      (MinigameTemplate & { version?: number }) | undefined;
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
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const now = FieldValue.serverTimestamp();
    const config = pickConfig(tpl);
    const publicConfig =
      tpl.type === "quiz"
        ? {
            questions: tpl.quiz.questions.map(
              ({ correctOptionId: _answer, ...question }) => question
            ),
          }
        : config;
    const baseInstance: Record<string, unknown> = {
      eventSlug: slug,
      templateId,
      templateVersion: tpl.version ?? 1,
      type: tpl.type,
      mode: modeForType(tpl.type),
      state: "scheduled",
      title: tpl.title,
      config: publicConfig,
      order,
      createdAt: now,
      createdBy: user.uid,
    };
    if (tpl.type === "quiz") {
      baseInstance.currentQuestionIndex = -1;
      baseInstance.currentQuestionStartedAt = null;
      baseInstance.revealedQuestionId = null;
    }
    if (tpl.type === "poll") {
      baseInstance.currentQuestionIndex = -1;
    }
    if (tpl.type === "roulette") {
      baseInstance.spinCount = 0;
      baseInstance.lastSpinWinnerId = null;
      baseInstance.lastSpinAt = null;
    }
    // Non-null only for a classic bingo, which needs a sealed calling
    // sequence before the first participant can be dealt a card.
    // Optional chaining because `tpl` is raw Firestore data wearing the
    // schema type, not something zod has parsed.
    let classicTerms: string[] | null = null;
    if (tpl.type === "bingo" && tpl.bingo?.classic === true) {
      classicTerms = tpl.bingo.terms ?? [];
      baseInstance.drawCount = 0;
      baseInstance.drawnTerms = [];
      baseInstance.lastDrawnTerm = null;
      baseInstance.lastDrawAt = null;
      baseInstance.bingoWinnerCount = 0;
    }

    const ref = await instancesCol(slug).add(baseInstance);

    if (tpl.type === "quiz") {
      await ref
        .collection("secret")
        .doc("quiz")
        .set({
          answers: Object.fromEntries(
            tpl.quiz.questions.map((q) => [q.id, q.correctOptionId])
          ),
        });
    }

    if (classicTerms) {
      // Seal it now, before anyone can join: cards are scored against
      // this sequence so that no two of them win on the same ball, and
      // that scoring is impossible until the sequence exists.
      await ensureDrawOrder(ref, classicTerms);
    }

    await writeAuditLog(
      auditEntry("minigame_instance.attach", user.uid, ref.id, {
        slug,
        type: tpl.type,
        title: tpl.title,
        templateId,
      }),
      req
    );

    res
      .status(201)
      .json({ success: true, data: { id: ref.id, type: tpl.type } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

// POST /api/events/:slug/minigames/:id/poll/advance
export async function pollAdvance(req: Request, res: Response) {
  try {
    const { slug, id } = req.params as { slug: string; id: string };
    const ref = instancesCol(slug).doc(id);
    const result = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (data?.type !== "poll" || data.state !== "live") return null;
      const questions =
        data.config?.questions ??
        (data.config?.question ? [{ id: "main" }] : []);
      const current =
        data.currentQuestionIndex ?? (data.config?.question ? 0 : -1);
      const next = current + 1;
      if (next >= questions.length) return null;
      tx.update(ref, { currentQuestionIndex: next });
      return next;
    });
    if (result === null) {
      res.status(400).json({
        success: false,
        error: "Encuesta inactiva o sin más preguntas",
      });
      return;
    }
    await writeAuditLog(
      {
        action: "minigame_instance.poll.advance",
        performedBy: (req as AuthenticatedRequest).user.uid,
        targetId: id,
        targetType: "minigame_instance",
        details: { slug, currentQuestionIndex: result },
      },
      req
    );
    res.json({ success: true, data: { id, currentQuestionIndex: result } });
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
      update.activatedAt = FieldValue.serverTimestamp();
    } else if (state === "closed") {
      update.closedAt = FieldValue.serverTimestamp();
    }

    await ref.update(update);

    await writeAuditLog(
      auditEntry(`minigame_instance.state.${state}`, user.uid, id, {
        slug,
        state,
      }),
      req
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
          currentQuestionStartedAt?: Timestamp | null;
          config?: { questions?: { id: string; timeLimitSec: number }[] };
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
    if (fromIndex >= 0 && data.currentQuestionStartedAt) {
      const previous = questions[fromIndex];
      const endsAt =
        data.currentQuestionStartedAt.toMillis() +
        (previous?.timeLimitSec ?? 30) * 1000;
      if (Date.now() < endsAt) {
        res.status(409).json({
          success: false,
          error: "Espera a que termine la pregunta actual",
        });
        return;
      }
      const previousRound = await ref
        .collection("quiz_rounds")
        .doc(previous.id)
        .get();
      if (!previousRound.data()?.finishedAt) {
        res.status(409).json({
          success: false,
          error: "Esperando los resultados de la pregunta actual",
        });
        return;
      }
    }
    const toIndex = fromIndex + 1;
    if (toIndex >= questions.length) {
      res
        .status(400)
        .json({ success: false, error: "Already on last question" });
      return;
    }

    const startedAt = Timestamp.now();
    const question = questions[toIndex] as {
      timeLimitSec?: number;
      id?: string;
    };
    if (!question?.id) {
      res.status(400).json({ success: false, error: "Pregunta inválida" });
      return;
    }
    await getFunctions()
      .taskQueue("finishQuizQuestion")
      .enqueue(
        {
          slug,
          id,
          questionId: question.id,
          startedAtMillis: startedAt.toMillis(),
        },
        {
          scheduleTime: new Date(
            startedAt.toMillis() + (question.timeLimitSec ?? 30) * 1000 + 2000
          ),
        }
      );
    const batch = admin.firestore().batch();
    batch.update(ref, {
      currentQuestionIndex: toIndex,
      currentQuestionStartedAt: startedAt,
    });
    batch.set(ref.collection("quiz_rounds").doc(question.id), {
      startedAtMillis: startedAt.toMillis(),
    });
    await batch.commit();

    await writeAuditLog(
      auditEntry("minigame_instance.quiz.advance", user.uid, id, {
        slug,
        fromIndex,
        toIndex,
      }),
      req
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

    await writeAuditLog(
      auditEntry("minigame_instance.delete", user.uid, id, {
        slug,
        title: data?.title,
      }),
      req
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
      return "questions" in tpl.poll
        ? { ...tpl.poll }
        : {
            questions: [
              {
                id: "main",
                prompt: (tpl.poll as unknown as { question: string }).question,
                options: (tpl.poll as unknown as { options: unknown[] })
                  .options,
              },
            ],
          };
    case "quiz":
      return { ...tpl.quiz };
    case "wordcloud":
      return { ...tpl.wordcloud };
    case "bingo":
      return { ...tpl.bingo };
    case "roulette":
      return { ...tpl.roulette };
  }
}

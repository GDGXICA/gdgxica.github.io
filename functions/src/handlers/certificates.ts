import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import { buildCertificatePdf } from "../services/certificatePdf";
import { sendCertificateEmail } from "../services/email";
import { CertificateSendBody } from "../schemas";

// Bounded concurrency so a large batch doesn't open hundreds of SMTP
// connections at once (Gmail throttles) while still being much faster
// than a fully sequential loop.
const CONCURRENCY = 4;

interface SendResult {
  email: string;
  name: string;
  ok: boolean;
  error?: string;
}

async function sendOne(
  body: CertificateSendBody,
  recipient: { name: string; email: string }
): Promise<SendResult> {
  try {
    const pdf = await buildCertificatePdf({
      recipientName: recipient.name,
      eventName: body.eventName,
      startTime: body.startTime,
      endTime: body.endTime,
      hours: body.hours,
      eventDate: body.eventDate,
      organizer: body.organizer,
    });
    await sendCertificateEmail({
      to: recipient.email,
      recipientName: recipient.name,
      eventName: body.eventName,
      pdf,
    });

    // Required audit trail: who received which certificate and where it
    // was sent. The PDF itself is never stored — only this metadata.
    logger.info("certificate.sent", {
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      eventName: body.eventName,
    });
    return { email: recipient.email, name: recipient.name, ok: true };
  } catch (err) {
    logger.error("certificate.failed", {
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      eventName: body.eventName,
      error: safeError(err),
    });
    return {
      email: recipient.email,
      name: recipient.name,
      ok: false,
      error: safeError(err),
    };
  }
}

export async function sendCertificates(req: Request, res: Response) {
  try {
    const body = req.body as CertificateSendBody;
    const user = (req as AuthenticatedRequest).user;

    const results: SendResult[] = new Array(body.recipients.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < body.recipients.length) {
        const i = cursor++;
        results[i] = await sendOne(body, body.recipients[i]);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, body.recipients.length) },
        () => worker()
      )
    );

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    admin
      .firestore()
      .collection("audit_log")
      .add({
        action: "certificate.send",
        performedBy: user.uid,
        targetId: body.eventName,
        targetType: "certificate",
        details: { eventName: body.eventName, sent, failed },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(() => {});

    res.json({
      success: true,
      data: {
        sent,
        failed,
        results: results.map((r) => ({
          email: r.email,
          name: r.name,
          ok: r.ok,
          error: r.error,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

import { Request, Response } from "express";
import { writeAuditLog } from "../utils/audit";
import { AuthenticatedRequest } from "../middleware/auth";
import { safeError } from "../middleware/validate";
import {
  emailSettingsRef,
  writeEmailTransport,
} from "../services/emailSettings";
import {
  DEFAULT_TRANSPORT,
  dailyCapFor,
  isEmailTransport,
  isResendConfigured,
} from "../services/emailTransport";
import type { EmailTransportInput } from "../schemas/credentials";

/**
 * GET /api/settings/email
 *
 * Reports which service sends credential email and what its daily ceiling
 * is. The cap is returned rather than hardcoded in the panel so the two
 * cannot drift — it belongs to the transport, not to the UI.
 */
export async function getEmailSettings(req: Request, res: Response) {
  try {
    const snap = await emailSettingsRef().get();
    const value = snap.data()?.transport;
    const transport = isEmailTransport(value) ? value : DEFAULT_TRANSPORT;

    res.json({
      success: true,
      data: {
        transport,
        dailyCap: dailyCapFor(transport),
        // So the panel can warn BEFORE the switch is flipped rather than
        // leaving the operator to discover it through failed sends.
        resendConfigured: isResendConfigured(),
        updatedAt: snap.data()?.updatedAt ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

/**
 * PUT /api/settings/email
 *
 * Switches the transport. Takes effect on the next drain run, within five
 * minutes, with no deploy — which is the point: if Resend starts failing
 * on the day of the event, going back to Gmail is a click.
 *
 * Nothing already queued is lost. Documents carry no transport of their
 * own; the drain reads the current setting each run, so a message queued
 * under one transport simply leaves through the other.
 */
export async function setEmailSettings(req: Request, res: Response) {
  try {
    const user = (req as AuthenticatedRequest).user;
    const { transport } = req.body as EmailTransportInput;

    await writeEmailTransport(transport, user.uid);

    await writeAuditLog(
      {
        action: "settings.email_transport",
        performedBy: user.uid,
        targetId: "email",
        targetType: "settings",
        details: { transport },
      },
      req
    );

    res.json({
      success: true,
      data: { transport, dailyCap: dailyCapFor(transport) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
}

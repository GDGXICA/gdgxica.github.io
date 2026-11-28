import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { safeError } from "../middleware/validate";
import { logParticipantAudit } from "../utils/audit";
import {
  isAlreadyExistsError,
  isTransientFirestoreError,
} from "../utils/firestoreErrors";

const GUEST_TOKEN_PREFIX = "guest.";
const GUEST_UID_PATTERN = /^g_[A-Za-z0-9_-]{8,40}$/;
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const SETTINGS_DOC_PATH = "settings/minigame_session";

let cachedKeyPromise: Promise<Buffer> | null = null;

async function loadSigningKey(): Promise<Buffer> {
  const envSecret = process.env.MINIGAME_GUEST_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return Buffer.from(envSecret, "utf8");
  }

  const db = admin.firestore();
  const ref = db.doc(SETTINGS_DOC_PATH);
  const snap = await ref.get();
  const existingHex = snap.data()?.signingKeyHex as string | undefined;
  if (existingHex && /^[0-9a-f]{64,}$/i.test(existingHex)) {
    return Buffer.from(existingHex, "hex");
  }

  const generated = randomBytes(32);
  try {
    await ref.create({
      signingKeyHex: generated.toString("hex"),
      createdAt: FieldValue.serverTimestamp(),
    });
    return generated;
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err;
    const retrySnap = await ref.get();
    const retryHex = retrySnap.data()?.signingKeyHex as string | undefined;
    if (retryHex && /^[0-9a-f]{64,}$/i.test(retryHex)) {
      return Buffer.from(retryHex, "hex");
    }
    throw err;
  }
}

export function getGuestSigningKey(): Promise<Buffer> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = loadSigningKey().catch((err) => {
      cachedKeyPromise = null;
      throw err;
    });
  }
  return cachedKeyPromise;
}

export function __resetGuestSigningKeyCache(): void {
  cachedKeyPromise = null;
}

function signPayload(encodedPayload: string, key: Buffer): string {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

export function isGuestToken(token: string): boolean {
  return token.startsWith(GUEST_TOKEN_PREFIX);
}

export async function issueGuestSession(
  nowMs: number = Date.now()
): Promise<{ uid: string; token: string; expiresAt: number }> {
  const key = await getGuestSigningKey();
  const uid = `g_${randomBytes(12).toString("base64url")}`;
  const expiresAt = nowMs + GUEST_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ uid, exp: expiresAt })).toString(
    "base64url"
  );
  const sig = signPayload(payload, key);
  return {
    uid,
    token: `${GUEST_TOKEN_PREFIX}${payload}.${sig}`,
    expiresAt,
  };
}

export async function verifyGuestToken(
  token: string,
  nowMs: number = Date.now()
): Promise<{ uid: string } | null> {
  if (!token.startsWith(GUEST_TOKEN_PREFIX)) return null;
  const rest = token.slice(GUEST_TOKEN_PREFIX.length);
  const dotIdx = rest.indexOf(".");
  if (dotIdx <= 0 || dotIdx !== rest.lastIndexOf(".")) return null;

  const encodedPayload = rest.slice(0, dotIdx);
  const providedSig = rest.slice(dotIdx + 1);
  if (!encodedPayload || !providedSig) return null;

  const key = await getGuestSigningKey();
  const expectedSig = signPayload(encodedPayload, key);
  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  let parsed: { uid?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as { uid?: unknown; exp?: unknown };
  } catch {
    return null;
  }

  if (
    typeof parsed.uid !== "string" ||
    !GUEST_UID_PATTERN.test(parsed.uid) ||
    typeof parsed.exp !== "number" ||
    !Number.isFinite(parsed.exp) ||
    parsed.exp <= nowMs
  ) {
    return null;
  }

  return { uid: parsed.uid };
}

export async function createGuestSession(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const session = await issueGuestSession();
    logParticipantAudit(
      {
        action: "minigame_participant.session",
        performedBy: session.uid,
        targetId: slug,
        targetType: "event",
        details: { kind: "guest" },
      },
      req
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, data: session });
  } catch (err) {
    const status = isTransientFirestoreError(err) ? 503 : 500;
    res.status(status).json({ success: false, error: safeError(err) });
  }
}

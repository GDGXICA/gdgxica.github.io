import { z } from "zod";
import { MAX_MURAL_PHOTO_BYTES } from "../services/imageLimits";

const MURAL_PHOTO_DATAURL_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export const MAX_MURAL_PHOTO_DATAURL_CHARS = 420_000;

const MAX_ALIAS = 24;

const MAX_NOTE = 300;

export const muralPhotoSchema = z
  .object({
    dataUrl: z
      .string()
      .regex(MURAL_PHOTO_DATAURL_RE)
      .max(MAX_MURAL_PHOTO_DATAURL_CHARS),

    alias: z.string().trim().max(MAX_ALIAS).default(""),

    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),

    consent: z.literal(true),

    clientRequestId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  })
  .strict();

export const muralReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(MAX_NOTE).default(""),
  })
  .strict()

  .refine((v) => v.decision === "approve" || v.note.length > 0, {
    path: ["note"],
    message: "Un rechazo necesita un motivo",
  });

export const muralTakedownSchema = z
  .object({
    reason: z.enum(["owner_request", "moderation", "other"]),

    note: z.string().trim().min(1).max(MAX_NOTE),
  })
  .strict();

export const muralRemovalRequestSchema = z
  .object({
    note: z.string().trim().max(MAX_NOTE).default(""),
  })
  .strict();

export const muralSettingsSchema = z
  .object({
    state: z.enum(["closed", "open", "paused"]),
    maxPerUid: z.number().int().min(1).max(50),

    maxTotal: z.number().int().min(1).max(5_000),
    headline: z.string().trim().max(120).default(""),
  })
  .strict();

export const muralUploaderBlockSchema = z
  .object({
    blocked: z.boolean(),
    note: z.string().trim().max(MAX_NOTE).default(""),
  })
  .strict();

export { MAX_MURAL_PHOTO_BYTES };

import { z } from "zod";

// Attendee credential submissions.
//
// Modelled on checkinImportSchema: .strict(), explicit bounds on every
// string, and validated through validateBody() so req.body is replaced by
// the parsed value. Do NOT model anything here on handlers/forms.ts — it
// is the only write path in the API without a Zod schema and it spreads
// req.body blindly over stored state.

const DNI_RE = /^\d{8}$/;

// GitHub's own rule: alphanumeric plus single internal hyphens, 1-39
// chars. The lookahead is what rejects a trailing or doubled hyphen.
const GITHUB_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

// Only JPEG. The client re-encodes both images through a canvas before
// sending, so the format is ours to dictate, and pinning it lets the
// handler verify magic bytes without sniffing.
const JPEG_DATAURL_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

// Payload budget against express.json({ limit: "1mb" }) in index.ts.
// Base64 inflates by 4/3, so these char caps bound the decoded bytes at
// roughly 220 KB and 465 KB respectively. Typical real values land near
// 60 KB and 240 KB; the caps exist so a crafted request cannot walk the
// body up to the Express limit and have the request rejected by the
// middleware with an unhelpful error instead of a mapped 400.
//   photo            <= 300_000 chars  (~220 KB)
//   credential image <= 620_000 chars  (~465 KB)
//   everything else  <=   4_000 chars
//   worst case ~924 KB, comfortably under 1 MB.
export const MAX_PHOTO_DATAURL_CHARS = 300_000;
export const MAX_CREDENTIAL_DATAURL_CHARS = 620_000;

/**
 * Policy versions this deployment will accept a consent against.
 *
 * An enum rather than a free string: the stored consent is a legal
 * artifact, and it is only meaningful if the version it names is one we
 * can still produce the text of. A client submitting an unknown version
 * is either stale or forged, and both deserve a 400.
 */
export const KNOWN_POLICY_VERSIONS = ["2026-08-01"] as const;

export const credentialCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    dni: z.string().trim().regex(DNI_RE),
    email: z.string().trim().toLowerCase().email().max(254),
    company: z.string().trim().max(120).default(""),
    githubUsername: z
      .string()
      .trim()
      .regex(GITHUB_RE)
      .max(39)
      .nullable()
      .default(null),

    // Mirrors of the questions the Google/Bevy panel asks, so a human can
    // transcribe the record without going back to the attendee.
    heardAbout: z.enum([
      "redes_sociales",
      "amigo_colega",
      "universidad",
      "meetup",
      "otro",
    ]),
    heardAboutOther: z.string().trim().max(120).default(""),
    yearsExperience: z.enum(["menos_1", "1_2", "3_5", "6_10", "mas_10"]),
    googleToolsLevel: z.enum(["ninguna", "basica", "intermedia", "avanzada"]),

    // z.literal(true), not z.boolean(). There is no valid record without
    // consent, so an unchecked box must be a 400 the client can map back
    // to the specific checkbox — never a stored `false` that looks like a
    // deliberate refusal we accepted anyway.
    consentGdgTerms: z.literal(true),
    consentGooglePrivacy: z.literal(true),
    consentCodeOfConduct: z.literal(true),
    consentDataProcessing: z.literal(true),
    consentAgeAttested: z.literal(true),
    consentPolicyVersion: z.enum(KNOWN_POLICY_VERSIONS),

    avatarKind: z.enum(["photo", "mascot"]),
    mascotId: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .nullable()
      .default(null),
    photoDataUrl: z
      .string()
      .regex(JPEG_DATAURL_RE)
      .max(MAX_PHOTO_DATAURL_CHARS)
      .nullable()
      .default(null),
    credentialImageDataUrl: z
      .string()
      .regex(JPEG_DATAURL_RE)
      .max(MAX_CREDENTIAL_DATAURL_CHARS)
      .nullable()
      .default(null),
  })
  .strict()
  .refine((v) => (v.avatarKind === "photo" ? !!v.photoDataUrl : !!v.mascotId), {
    path: ["avatarKind"],
    message: "Falta la foto o la mascota para el tipo de avatar elegido",
  })
  .refine((v) => v.heardAbout !== "otro" || v.heardAboutOther.length > 0, {
    path: ["heardAboutOther"],
    message: "Cuentanos como te enteraste",
  });

export const credentialBevyStatusSchema = z
  .object({
    status: z.enum(["pending", "loaded", "not_found", "discarded"]),
    ticketNumber: z.string().trim().max(100).nullable().default(null),
    note: z.string().trim().max(300).nullable().default(null),
  })
  .strict();

export const credentialPhotoModerationSchema = z
  .object({
    action: z.enum(["approve", "remove"]),
    reason: z.string().trim().max(200).default(""),
  })
  .strict();

export type CredentialCreateInput = z.infer<typeof credentialCreateSchema>;
export type CredentialBevyStatusInput = z.infer<
  typeof credentialBevyStatusSchema
>;
export type CredentialPhotoModerationInput = z.infer<
  typeof credentialPhotoModerationSchema
>;

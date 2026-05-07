import { z } from "zod";

// Reused primitives ---------------------------------------------------------

const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const shortText = (max: number) => z.string().max(max);
const longText = (max: number) => z.string().max(max);

// Schemas -------------------------------------------------------------------

export const sponsorItemSchema = z
  .object({
    id: shortText(100),
    image_url: shortText(2000),
    alt: shortText(500),
  })
  .strict();

export const agendaItemSchema = z
  .object({
    time: shortText(100),
    title: shortText(500),
    speaker: shortText(500),
    image: shortText(2000),
    role: shortText(500),
    type: shortText(100),
  })
  .strict();

export const trackDefSchema = z
  .object({
    id: shortText(100),
    name: shortText(500),
    color: shortText(50),
    description: shortText(1000),
  })
  .strict();

export const trackSessionSchema = z
  .object({
    id: z.number().int().nonnegative(),
    title: shortText(500),
    name: shortText(500),
    image: shortText(2000),
    role: shortText(500),
    type: shortText(100),
    startTime: shortText(20),
    endTime: shortText(20),
    duration: shortText(50),
    isKeynote: z.boolean().optional(),
  })
  .strict();

export const eventSchema = z
  .object({
    id: safeId,
    title: shortText(500).min(1),
    description: longText(20000).default(""),
    short_description: longText(1000).default(""),
    date: shortText(50).default(""),
    end_time: shortText(50).default(""),
    venue: shortText(500).default(""),
    venue_address: shortText(1000).default(""),
    venue_map_url: shortText(2000).default(""),
    venue_map_embed: shortText(2000).default(""),
    image_url: shortText(2000).default(""),
    topics: z.array(shortText(200)).max(50).default([]),
    technologies: z.array(shortText(200)).max(50).default([]),
    speaker_ids: z.array(shortText(200)).max(100).default([]),
    speaker_names: z.array(shortText(500)).max(100).default([]),
    registration_url: shortText(2000).default(""),
    whatsapp_group_link: shortText(2000).default(""),
    is_virtual: z.boolean().default(false),
    is_highlight: z.boolean().default(false),
    participants: z.number().int().min(0).max(1_000_000).default(0),
    max_participants: z.number().int().min(0).max(1_000_000).default(0),
    category: shortText(100).default(""),
    status: shortText(100).default(""),
    requirements: z.array(shortText(500)).max(50).default([]),
    includes: z.array(shortText(500)).max(50).default([]),
    materials: z.record(shortText(100), shortText(2000)).default({}),
    sponsors: z.array(sponsorItemSchema).max(100).default([]),
    agenda: z.array(agendaItemSchema).max(200).default([]),
    tracks: z.array(trackDefSchema).max(50).default([]),
    track_sessions: z
      .record(shortText(100), z.array(trackSessionSchema).max(200))
      .default({}),
  })
  .strict();

export const speakerSchema = z
  .object({
    id: safeId,
    name: shortText(500).min(1),
    bio: longText(20000).default(""),
    photo_url: shortText(2000).default(""),
    company: shortText(500).default(""),
    role: shortText(500).default(""),
    topics: z.array(shortText(200)).max(50).default([]),
    social_links: z.record(shortText(50), shortText(2000)).default({}),
    talk_ids: z.array(shortText(200)).max(100).default([]),
  })
  .strict();

export const sponsorSchema = z
  .object({
    name: shortText(500).min(1),
    logo_url: shortText(2000).default(""),
    url: shortText(2000).default(""),
    sector: shortText(500).default(""),
    description: longText(20000).default(""),
    featured: z.boolean().default(false),
    id: shortText(100).optional(),
    events_sponsored: z.number().int().nonnegative().optional(),
    since_year: z.number().int().min(1900).max(3000).optional(),
  })
  .strict();

export const teamMemberSchema = z
  .object({
    id: safeId,
    name: shortText(500).min(1),
    role: shortText(500).default(""),
    photo_url: shortText(2000).default(""),
    bio: longText(20000).default(""),
    social_links: z.record(shortText(50), shortText(2000)).default({}),
    type: z.enum(["organizer", "member"]),
    tags: z.array(shortText(200)).max(50).optional(),
    joined_date: shortText(100).optional(),
    responsibilities: z.array(shortText(500)).max(50).optional(),
  })
  .strict();

export const locationSchema = z
  .object({
    name: shortText(500).min(1),
    address: shortText(1000).default(""),
    map_url: shortText(2000).default(""),
    map_embed: shortText(2000).default(""),
  })
  .strict();

// Mini-game templates ------------------------------------------------------
//
// Each template is one of four discriminated types. The schema is the
// authoritative shape both for create and update — admins always send the
// full document. Validation is `.strict()` everywhere so unknown fields are
// rejected and cannot land in Firestore.

const optionItemSchema = z
  .object({
    id: shortText(100),
    label: shortText(500).min(1),
  })
  .strict();

const quizQuestionSchema = z
  .object({
    id: shortText(100),
    prompt: shortText(1000).min(1),
    options: z.array(optionItemSchema).min(2).max(6),
    correctOptionId: shortText(100),
    timeLimitSec: z.number().int().min(5).max(300).default(30),
    points: z.number().int().min(0).max(10000).default(100),
  })
  .strict();

const baseTemplate = {
  title: shortText(500).min(1),
  description: longText(5000).default(""),
};

export const minigameTemplateSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("poll"),
      ...baseTemplate,
      poll: z
        .object({
          question: shortText(1000).min(1),
          options: z.array(optionItemSchema).min(2).max(6),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz"),
      ...baseTemplate,
      quiz: z
        .object({
          questions: z.array(quizQuestionSchema).min(1).max(50),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("wordcloud"),
      ...baseTemplate,
      wordcloud: z
        .object({
          prompt: shortText(500).min(1),
          maxWordsPerUser: z.number().int().min(1).max(10).default(3),
          maxLength: z.number().int().min(5).max(120).default(60),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("bingo"),
      ...baseTemplate,
      bingo: z
        .object({
          terms: z.array(shortText(120).min(1)).min(16).max(200),
          cardSize: z.literal(4).default(4),
          freeCenter: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
]);

export type MinigameTemplate = z.infer<typeof minigameTemplateSchema>;
export type MinigameTemplateType = MinigameTemplate["type"];

// Mini-game instances (template attached to an event) ---------------------
//
// Two narrow body schemas, one per write endpoint. The instance document
// itself stores the snapshotted template config (built server-side at
// attach time) plus runtime fields managed by the Cloud Function — those
// are not part of any client write payload.

export const minigameInstanceCreateSchema = z
  .object({
    templateId: shortText(100).min(1),
    order: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

export const minigameStateSchema = z
  .object({
    state: z.enum(["scheduled", "live", "closed"]),
  })
  .strict();

// Public participant join body. Tight validation here keeps the join
// handler focused on idempotency and bingo card seeding.
export const minigameJoinSchema = z
  .object({
    alias: z.string().trim().min(1).max(24),
  })
  .strict();

// Admin-only: hide/unhide a word from the wordcloud display.
export const minigameWordHiddenSchema = z
  .object({
    hidden: z.boolean(),
  })
  .strict();

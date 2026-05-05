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

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const events = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/data/events" }),
  schema: z.object({
    name: z.string(),
    image: z.string(),
    shortDescription: z.string(),
    date: z.string(),
    time: z.string(),
    location: z.object({
      name: z.string(),
      direction: z.string(),
      googleMapEmbed: z.string(),
      googleMapLink: z.string(),
    }),
    isVirtual: z.boolean(),
    participants: z.number(),
    maxParticipants: z.number(),
    category: z.object({
      label: z.string(),
      type: z.enum([
        "devfest",
        "io",
        "studyjam",
        "wtm",
        "meetup",
        "hackaton",
        "",
      ]),
    }),
    status: z.object({
      label: z.string(),
      type: z.enum(["upcoming", "in-progress", "completed"]),
    }),
    isHighlight: z.boolean(),
    tags: z.array(z.string()),
    speakerNames: z.array(z.string()),
    largeDescription: z.string(),
    registerFormLink: z.string(),
    requirements: z.array(z.string()),
    include: z.array(z.string()),
    technologies: z.array(z.string()),
    schedule: z.array(
      z.object({
        id: z.number(),
        time: z.string(),
        title: z.string(),
        name: z.string(),
        image: z.string(),
        role: z.string(),
        type: z.enum(["event", "break"]),
      })
    ),
    speakers: z.array(
      z.object({
        id: z.number(),
        image: z.string(),
        name: z.string(),
        role: z.string(),
        description: z.string(),
        linkedin: z.string(),
        web: z.string(),
        youtube: z.string(),
        twitter: z.string(),
        github: z.string(),
      })
    ),
    sponsors: z.array(
      z.object({
        id: z.number(),
        image: z.string(),
      })
    ),
  }),
});
export const collections = { events };

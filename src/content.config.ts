import { defineCollection, z } from "astro:content";
import { file, glob } from "astro/loaders";

const events = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/data/events" }),
  schema: z.object({
    id: z.number(),
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
    tracks: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          color: z.string(),
          description: z.string(),
        })
      )
      .optional(),
    schedule: z.union([
      z.array(
        z.object({
          id: z.number(),
          time: z.string(),
          title: z.string(),
          name: z.string(),
          image: z.string(),
          role: z.string(),
          type: z.string(),
        })
      ),
      z.object({
        trackSessions: z.record(
          z.string(),
          z.array(
            z.object({
              id: z.number(),
              title: z.string(),
              name: z.string(),
              image: z.string(),
              role: z.string(),
              type: z.string(),
              startTime: z.string(),
              endTime: z.string(),
              duration: z.string(),
              isKeynote: z.boolean().optional(),
            })
          )
        ),
      }),
    ]),
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
        alt: z.string(),
      })
    ),
  }),
});

const gallery = defineCollection({
  loader: file("src/data/gallery/gallery.json"),
  schema: z.object({
    id: z.number(),
    src: z.string(),
    alt: z.string(),
    title: z.string(),
    description: z.string(),
    tag: z.string(),
    type: z.enum([
      "devfest",
      "io",
      "studyjam",
      "wtm",
      "meetup",
      "hackaton",
      "workshop",
      "networking",
      "hackathon",
    ]),
  }),
});

const members = defineCollection({
  loader: file("src/data/members/members.json"),
  schema: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    joinedDate: z.string(),
    responsibilities: z.array(z.string()),
    avatar: z.string(),
    tags: z.array(z.string()),
    links: z.object({
      linkedin: z.string().optional(),
      twitter: z.string().optional(),
      github: z.string().optional(),
      web: z.string().optional(),
    }),
  }),
});

const organizers = defineCollection({
  loader: file("src/data/organizers/organizers.json"),
  schema: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    avatar: z.string(),
    tags: z.array(z.string()),
    links: z.object({
      linkedin: z.string().optional(),
      github: z.string().optional(),
      web: z.string().optional(),
    }),
  }),
});

const sponsors = defineCollection({
  loader: file("src/data/sponsors/sponsors.json"),
  schema: z.object({
    id: z.number(),
    name: z.string(),
    logo: z.string(),
    sector: z.string(),
    description: z.string(),
    eventsSponsored: z.number(),
    sinceYear: z.number(),
    website: z.string(),
    featured: z.boolean(),
  }),
});

const volunteers = defineCollection({
  loader: file("src/data/volunteers/volunteers.json"),
  schema: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    area: z.string(),
    bio: z.string(),
    avatar: z.string(),
    links: z.object({
      linkedin: z.string().optional(),
      twitter: z.string().optional(),
    }),
  }),
});
export const collections = {
  events,
  gallery,
  members,
  organizers,
  sponsors,
  volunteers,
};

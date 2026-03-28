import { defineCollection, z } from "astro:content";
import { loadEvents } from "./loaders/transform-events";
import { loadOrganizers, loadMembers } from "./loaders/transform-team";
import { loadSponsors } from "./loaders/transform-sponsors";
import { loadGallery } from "./loaders/transform-gallery";
import { loadVolunteers } from "./loaders/transform-volunteers";
import { loadVolunteerRoles } from "./loaders/transform-volunteer-roles";

const events = defineCollection({
  loader: loadEvents,
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
      type: z.enum(["devfest", "io", "studyjam", "wtm", "meetup"]),
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
        linkedin: z.string().optional(),
        web: z.string().optional(),
        youtube: z.string().optional(),
        twitter: z.string().optional(),
        github: z.string().optional(),
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
  loader: loadGallery,
  schema: z.object({
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
      "workshop",
      "networking",
      "hackathon",
    ]),
  }),
});

const members = defineCollection({
  loader: loadMembers,
  schema: z.object({
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
  loader: loadOrganizers,
  schema: z.object({
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
  loader: loadSponsors,
  schema: z.object({
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
  loader: loadVolunteers,
  schema: z.object({
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

const volunteerRoles = defineCollection({
  loader: loadVolunteerRoles,
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string(),
    iconColor: z.string(),
    skills: z.array(z.string()),
    commitment: z.string(),
  }),
});

export const collections = {
  events,
  gallery,
  members,
  organizers,
  sponsors,
  volunteers,
  volunteerRoles,
};

import {
  fetchGdgData,
  stripDomain,
  formatSpanishDate,
  formatTime,
  expandCategory,
  expandStatus,
} from "./fetch-gdg-data";

interface ExternalEvent {
  id: string;
  title: string;
  description: string;
  short_description: string;
  date: string;
  end_time: string;
  venue: string;
  venue_address: string;
  venue_map_url: string;
  venue_map_embed?: string;
  image_url: string;
  topics: string[];
  speaker_names: string[];
  speaker_ids: string[];
  registration_url: string | null;
  whatsapp_group_link?: string;
  is_virtual: boolean;
  is_highlight: boolean;
  participants: number;
  max_participants: number;
  category: string;
  status: string;
  materials: Record<string, string>;
  requirements: string[];
  includes: string[];
  technologies?: string[];
  tracks?: {
    id: string;
    name: string;
    color: string;
    description: string;
  }[];
  agenda: {
    time: string;
    title: string;
    speaker: string;
    image?: string;
    role?: string;
    type?: string;
  }[];
  track_sessions?: Record<
    string,
    {
      id: number;
      title: string;
      name: string;
      image: string;
      role: string;
      type: string;
      startTime: string;
      endTime: string;
      duration: string;
      isKeynote?: boolean;
    }[]
  >;
  sponsors?: { id: string; image_url: string; alt: string }[];
}

interface ExternalSpeaker {
  id: string;
  name: string;
  bio: string;
  photo_url: string;
  company: string;
  role: string;
  topics: string[];
  social_links: {
    linkedin?: string;
    github?: string;
    web?: string;
    twitter?: string;
    youtube?: string;
  };
  talk_ids: string[];
}

export async function loadEvents() {
  const eventIndex = await fetchGdgData<{ id: string }[]>("events/index.json");
  const speakerIndex = await fetchGdgData<ExternalSpeaker[]>(
    "speakers/index.json"
  );

  const speakerMap = new Map<string, ExternalSpeaker>();
  for (const speaker of speakerIndex) {
    speakerMap.set(speaker.id, speaker);
  }

  const eventIds = eventIndex.map((e) => e.id);
  const eventDetails = await Promise.all(
    eventIds.map((id) => fetchGdgData<ExternalEvent>(`events/${id}.json`))
  );

  return eventDetails.map((event) => transformEvent(event, speakerMap));
}

function transformEvent(
  event: ExternalEvent,
  speakerMap: Map<string, ExternalSpeaker>
) {
  const speakers = (event.speaker_ids || []).map((id, index) => {
    const speaker = speakerMap.get(id);
    return {
      id: index + 1,
      image: speaker ? stripDomain(speaker.photo_url) : "/placeholder.svg",
      name: speaker?.name || id,
      role: speaker?.role || "",
      description: speaker?.bio || "",
      linkedin: speaker?.social_links?.linkedin || "",
      web: speaker?.social_links?.web || "",
      youtube: speaker?.social_links?.youtube || "",
      twitter: speaker?.social_links?.twitter || "",
      github: speaker?.social_links?.github || "",
    };
  });

  const sponsors = (event.sponsors || []).map((s, index) => ({
    id: index + 1,
    image: stripDomain(s.image_url),
    alt: s.alt,
  }));

  const schedule = buildSchedule(event);

  return {
    id: event.id,
    name: event.title,
    image: stripDomain(event.image_url),
    shortDescription: event.short_description,
    date: formatSpanishDate(event.date),
    time: formatTime(event.date, event.end_time),
    location: {
      name: event.venue || "",
      direction: event.venue_address || "",
      googleMapEmbed: event.venue_map_embed || "",
      googleMapLink: event.venue_map_url || "",
    },
    isVirtual: event.is_virtual,
    participants: event.participants,
    maxParticipants: event.max_participants,
    category: expandCategory(event.category),
    status: expandStatus(event.status),
    isHighlight: event.is_highlight,
    tags: event.topics,
    speakerNames: event.speaker_names,
    largeDescription: event.description,
    registerFormLink: event.registration_url || "",
    whatsappGroupLink: event.whatsapp_group_link || undefined,
    requirements: event.requirements,
    include: event.includes,
    technologies: event.technologies || event.topics,
    tracks: event.tracks,
    schedule,
    speakers,
    sponsors,
  };
}

function buildSchedule(event: ExternalEvent) {
  if (event.track_sessions) {
    const trackSessions: Record<string, (typeof event.track_sessions)[string]> =
      {};
    for (const [track, sessions] of Object.entries(event.track_sessions)) {
      trackSessions[track] = sessions.map((s) => ({
        ...s,
        image: stripDomain(s.image),
      }));
    }
    return { trackSessions };
  }

  if (event.agenda && event.agenda.length > 0) {
    return event.agenda.map((item, index) => ({
      id: index + 1,
      time: item.time,
      title: item.title,
      name: item.speaker || "",
      image: stripDomain(item.image),
      role: item.role || "",
      type: item.type || "event",
    }));
  }

  return [];
}

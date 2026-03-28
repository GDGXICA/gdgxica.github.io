import { fetchGdgData } from "./fetch-gdg-data";

interface ExternalStats {
  total_members: number;
  total_events: number;
  total_talks: number;
  total_speakers: number;
  years_active: number;
  total_organizers: number;
  developers_mentored: number;
  total_sponsors: number;
  annual_support: string;
  sponsored_events: number;
  developers_reached: number;
  active_volunteers: number;
  volunteer_hours: number;
  events_supported: number;
  volunteer_areas: number;
  updated_at: string;
}

interface ExternalLinks {
  forms: {
    join_community: string;
    propose_event: string;
    join_team: string;
    sponsor: string;
    volunteer: string;
    contact: string;
  };
  social: {
    linkedin: string;
    facebook: string;
    instagram: string;
  };
  community: string;
}

export interface SiteStats {
  totalMembers: number;
  totalEvents: number;
  totalTalks: number;
  totalSpeakers: number;
  yearsActive: number;
  totalOrganizers: number;
  developersMentored: number;
  totalSponsors: number;
  annualSupport: string;
  sponsoredEvents: number;
  developersReached: number;
  activeVolunteers: number;
  volunteerHours: number;
  eventsSupported: number;
  volunteerAreas: number;
}

export interface SiteLinks {
  forms: {
    joinCommunity: string;
    proposeEvent: string;
    joinTeam: string;
    sponsor: string;
    volunteer: string;
    contact: string;
  };
  social: {
    linkedin: string;
    facebook: string;
    instagram: string;
  };
  community: string;
}

export async function fetchStats(): Promise<SiteStats> {
  const raw = await fetchGdgData<ExternalStats>("about/stats.json");
  return {
    totalMembers: raw.total_members,
    totalEvents: raw.total_events,
    totalTalks: raw.total_talks,
    totalSpeakers: raw.total_speakers,
    yearsActive: raw.years_active,
    totalOrganizers: raw.total_organizers,
    developersMentored: raw.developers_mentored,
    totalSponsors: raw.total_sponsors,
    annualSupport: raw.annual_support,
    sponsoredEvents: raw.sponsored_events,
    developersReached: raw.developers_reached,
    activeVolunteers: raw.active_volunteers,
    volunteerHours: raw.volunteer_hours,
    eventsSupported: raw.events_supported,
    volunteerAreas: raw.volunteer_areas,
  };
}

export async function fetchLinks(): Promise<SiteLinks> {
  const raw = await fetchGdgData<ExternalLinks>("about/links.json");
  return {
    forms: {
      joinCommunity: raw.forms.join_community,
      proposeEvent: raw.forms.propose_event,
      joinTeam: raw.forms.join_team,
      sponsor: raw.forms.sponsor,
      volunteer: raw.forms.volunteer,
      contact: raw.forms.contact,
    },
    social: {
      linkedin: raw.social.linkedin,
      facebook: raw.social.facebook,
      instagram: raw.social.instagram,
    },
    community: raw.community,
  };
}

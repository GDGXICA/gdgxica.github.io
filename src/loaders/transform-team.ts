import { fetchGdgData, stripDomain } from "./fetch-gdg-data";

interface ExternalTeamMember {
  id: string;
  name: string;
  role: string;
  photo_url: string;
  bio: string;
  social_links: {
    linkedin?: string;
    github?: string;
    web?: string;
    twitter?: string;
  };
  type: "organizer" | "member";
  tags?: string[];
  joined_date?: string;
  responsibilities?: string[];
}

export async function loadOrganizers() {
  const team = await fetchGdgData<ExternalTeamMember[]>("about/team.json");
  return team
    .filter((m) => m.type === "organizer")
    .map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      bio: m.bio,
      avatar: stripDomain(m.photo_url),
      tags: m.tags || [],
      links: {
        linkedin: m.social_links?.linkedin,
        github: m.social_links?.github,
        web: m.social_links?.web,
      },
    }));
}

export async function loadMembers() {
  const team = await fetchGdgData<ExternalTeamMember[]>("about/team.json");
  return team
    .filter((m) => m.type === "member")
    .map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      bio: m.bio,
      joinedDate: m.joined_date || "",
      responsibilities: m.responsibilities || [],
      avatar: stripDomain(m.photo_url),
      tags: m.tags || [],
      links: {
        linkedin: m.social_links?.linkedin,
        twitter: m.social_links?.twitter,
        github: m.social_links?.github,
        web: m.social_links?.web,
      },
    }));
}

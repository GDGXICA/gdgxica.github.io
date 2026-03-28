import { fetchGdgData, stripDomain } from "./fetch-gdg-data";

interface ExternalVolunteer {
  id: string;
  name: string;
  role: string;
  area: string;
  bio: string;
  photo_url: string;
  social_links: {
    linkedin?: string;
    twitter?: string;
  };
}

export async function loadVolunteers() {
  try {
    const volunteers = await fetchGdgData<ExternalVolunteer[]>(
      "about/volunteers.json"
    );
    return volunteers.map((v) => ({
      id: v.id,
      name: v.name,
      role: v.role,
      area: v.area,
      bio: v.bio,
      avatar: stripDomain(v.photo_url),
      links: {
        linkedin: v.social_links?.linkedin,
        twitter: v.social_links?.twitter,
      },
    }));
  } catch {
    return [];
  }
}

import { fetchGdgData } from "./fetch-gdg-data";

interface ExternalVolunteerRole {
  id: string;
  title: string;
  description: string;
  icon: string;
  icon_color: string;
  skills: string[];
  commitment: string;
}

export async function loadVolunteerRoles() {
  const roles = await fetchGdgData<ExternalVolunteerRole[]>(
    "about/volunteer_roles.json"
  );
  return roles.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    icon: r.icon,
    iconColor: r.icon_color,
    skills: r.skills,
    commitment: r.commitment,
  }));
}

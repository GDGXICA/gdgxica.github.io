import { fetchGdgData, stripDomain } from "./fetch-gdg-data";

interface ExternalPartner {
  id?: string;
  name: string;
  logo_url: string;
  url: string;
  sector: string;
  description: string;
  featured: boolean;
  events_sponsored?: number;
  since_year?: number;
}

export async function loadSponsors() {
  const partners = await fetchGdgData<ExternalPartner[]>("about/partners.json");
  return partners.map((p, index) => ({
    id: p.id || `sponsor-${index + 1}`,
    name: p.name,
    logo: stripDomain(p.logo_url),
    sector: p.sector,
    description: p.description,
    eventsSponsored: p.events_sponsored || 0,
    sinceYear: p.since_year || 0,
    website: p.url,
    featured: p.featured,
  }));
}

// Builders de datos estructurados (JSON-LD / schema.org) reutilizables.
// El Layout (src/layouts/Layout.astro) inyecta cualquier objeto pasado como
// prop `schema` dentro de un <script type="application/ld+json">.

const SITE = "https://gdgica.com";

/** Convierte una ruta absoluta del sitio (p. ej. "/team/foo.png") en URL absoluta. */
function absUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;
}

interface SocialLinks {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
}

/** Lista de URLs de redes sociales (para `sameAs`), filtrando vacíos. */
function sameAs(social?: SocialLinks): string[] {
  if (!social) return [];
  return [social.linkedin, social.facebook, social.instagram].filter(
    (u): u is string => Boolean(u)
  );
}

/** Organization base de GDG Ica. */
export function buildOrganizationSchema(social?: SocialLinks) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Google Developer Group Ica",
    alternateName: "GDG Ica",
    url: SITE,
    logo: `${SITE}/gdg-logo.png`,
    foundingDate: "2015",
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Ica",
        addressCountry: "PE",
      },
    },
  };
  const links = sameAs(social);
  if (links.length) schema.sameAs = links;
  return schema;
}

interface TeamMember {
  name: string;
  role: string;
  avatar?: string;
  links?: { linkedin?: string; github?: string; web?: string };
}

/** Organization de GDG Ica con su equipo como `member` (Person). */
export function buildTeamSchema(members: TeamMember[], social?: SocialLinks) {
  const org = buildOrganizationSchema(social);
  org.member = members.map((m) => {
    const person: Record<string, unknown> = {
      "@type": "Person",
      name: m.name,
      jobTitle: m.role,
    };
    const image = absUrl(m.avatar);
    if (image) person.image = image;
    const profile = m.links?.linkedin || m.links?.web || m.links?.github;
    if (profile) person.sameAs = [profile];
    return person;
  });
  return org;
}

interface Sponsor {
  name: string;
  logo?: string;
  website?: string;
  description?: string;
}

/** ItemList de patrocinadores como Organization. */
export function buildSponsorsSchema(sponsors: Sponsor[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Patrocinadores de GDG Ica",
    itemListElement: sponsors.map((s, i) => {
      const org: Record<string, unknown> = {
        "@type": "Organization",
        name: s.name,
      };
      if (s.website) org.url = s.website;
      const logo = absUrl(s.logo);
      if (logo) org.logo = logo;
      if (s.description) org.description = s.description;
      return {
        "@type": "ListItem",
        position: i + 1,
        item: org,
      };
    }),
  };
}

/** Organization enriquecida para la página "Nosotros". */
export function buildAboutSchema(social?: SocialLinks) {
  const org = buildOrganizationSchema(social);
  org.description =
    "Comunidad de desarrolladores en Ica, Perú, enfocada en las tecnologías de Google. Desde 2015 organizamos eventos, talleres y meetups para aprender y construir comunidad.";
  org.areaServed = {
    "@type": "Place",
    name: "Ica, Perú",
  };
  return org;
}

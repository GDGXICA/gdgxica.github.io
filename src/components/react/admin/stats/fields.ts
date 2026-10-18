export interface Stats {
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

type StatKey = Exclude<keyof Stats, "updated_at">;

export interface Field {
  key: StatKey;
  label: string;
  type: "number" | "text";
  placeholder?: string;
}

interface Group {
  id: string;
  title: string;
  where: string;
  fields: Field[];
}

export const GROUPS: Group[] = [
  {
    id: "comunidad",
    title: "Comunidad",
    where: "Se ven en Inicio, Eventos y Nosotros.",
    fields: [
      { key: "total_members", label: "Miembros activos", type: "number" },
      { key: "total_events", label: "Eventos realizados", type: "number" },
      { key: "total_speakers", label: "Speakers", type: "number" },
      { key: "years_active", label: "Años activos", type: "number" },
    ],
  },
  {
    id: "patrocinio",
    title: "Patrocinio",
    where: "Se ven en Patrocinadores.",
    fields: [
      {
        key: "total_sponsors",
        label: "Patrocinadores activos",
        type: "number",
      },
      {
        key: "sponsored_events",
        label: "Eventos patrocinados",
        type: "number",
      },
      {
        key: "developers_reached",
        label: "Desarrolladores alcanzados",
        type: "number",
      },
    ],
  },
  {
    id: "voluntariado",
    title: "Voluntariado",
    where: "Se ven en Voluntariado.",
    fields: [
      {
        key: "active_volunteers",
        label: "Voluntarios activos",
        type: "number",
      },
      { key: "volunteer_hours", label: "Horas contribuidas", type: "number" },
      { key: "events_supported", label: "Eventos apoyados", type: "number" },
      { key: "volunteer_areas", label: "Áreas de apoyo", type: "number" },
    ],
  },
  {
    id: "sin-pagina",
    title: "Sin página todavía",
    where:
      "Se guardan con el resto, pero ninguna página del sitio las muestra por ahora.",
    fields: [
      { key: "total_talks", label: "Charlas", type: "number" },
      { key: "total_organizers", label: "Organizadores", type: "number" },
      {
        key: "developers_mentored",
        label: "Desarrolladores mentoreados",
        type: "number",
      },
      {
        key: "annual_support",
        label: "Apoyo anual",
        type: "text",
        placeholder: "$50k",
      },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

export function changedFields(saved: Stats, current: Stats): Field[] {
  return ALL_FIELDS.filter((field) => saved[field.key] !== current[field.key]);
}

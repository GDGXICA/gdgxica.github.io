import type { Permission } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  permission?: Permission;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Cada entrada declara el permiso que la habilita, en vez de la antigua
 * bandera `adminOnly`. Así el menú refleja los permisos reales — incluidos
 * los concedidos a una persona concreta — y no una jerarquía de roles.
 *
 * Ocultar una entrada es cosmético: la sección y su endpoint vuelven a
 * comprobar el permiso.
 */
export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ label: "Inicio", href: "/admin" }] },
  {
    label: "Contenido",
    items: [
      { label: "Eventos", href: "/admin/events", permission: "events:read" },
      {
        label: "Speakers",
        href: "/admin/speakers",
        permission: "speakers:read",
      },
      {
        label: "Sponsors",
        href: "/admin/sponsors",
        permission: "sponsors:read",
      },
      {
        label: "Ubicaciones",
        href: "/admin/locations",
        permission: "locations:read",
      },
      { label: "Foro", href: "/admin/posts", permission: "posts:read" },
      {
        label: "Cifras del sitio",
        href: "/admin/stats",
        permission: "stats:read",
      },
    ],
  },
  {
    label: "Evento en vivo",
    items: [
      { label: "Check-in", href: "/admin/checkin", permission: "roster:read" },
      {
        label: "Credenciales",
        href: "/admin/credentials",
        permission: "roster:read",
      },
      {
        label: "Mural",
        href: "/admin/events/mural",
        permission: "mural:moderate",
      },
      {
        label: "Minijuegos",
        href: "/admin/minigame-templates",
        permission: "minigames:template:read",
      },
      {
        label: "Formularios",
        href: "/admin/forms",
        permission: "forms:read",
      },
      {
        label: "Certificados",
        href: "/admin/certificates",
        permission: "certificates:send",
      },
    ],
  },
  {
    label: "Comunidad",
    items: [
      { label: "Equipo", href: "/admin/team", permission: "team:read" },
      {
        label: "Propuestas",
        href: "/admin/proposals",
        permission: "proposals:create",
      },
    ],
  },
  {
    label: "Acceso",
    items: [
      { label: "Usuarios", href: "/admin/users", permission: "users:read" },
      {
        label: "Solicitudes",
        href: "/admin/access",
        permission: "access:review",
      },
      {
        label: "Roles y permisos",
        href: "/admin/roles",
        permission: "users:read",
      },
      { label: "Auditoría", href: "/admin/audit", permission: "audit:read" },
    ],
  },
];

export interface EventTool {
  label: string;
  href: string;
  permission: Permission;
}

export const EVENT_TOOLS: EventTool[] = [
  { label: "Check-in", href: "/admin/checkin", permission: "roster:read" },
  {
    label: "Credenciales",
    href: "/admin/credentials",
    permission: "roster:read",
  },
  { label: "Mural", href: "/admin/events/mural", permission: "mural:moderate" },
  {
    label: "Minijuegos",
    href: "/admin/events/minigames",
    permission: "minigames:operate",
  },
];

const EXTRA_TITLES: Record<string, string> = {
  "/admin/events/new": "Nuevo evento",
  "/admin/events/staff": "Staff del evento",
  "/admin/events/minigames": "Minijuegos",
};

export function pageTitle(path: string, editing: boolean): string {
  if (path === "/admin/events/new" && editing) return "Editar evento";
  if (EXTRA_TITLES[path]) return EXTRA_TITLES[path];
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.href === path);
    if (item) return item.label;
  }
  return "Panel";
}

export function isEventTool(path: string): boolean {
  return EVENT_TOOLS.some((tool) => tool.href === path);
}

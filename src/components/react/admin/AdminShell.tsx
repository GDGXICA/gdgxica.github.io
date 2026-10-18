import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  canReachByAssignment,
  ROLE_LABELS,
  type Permission,
  type Role,
} from "@/lib/permissions";
import { EVENT_TOOLS, NAV_GROUPS, isEventTool, pageTitle } from "./nav";
import { useEventCatalog } from "./useEventCatalog";
import { usePendingCounts, type PendingKey } from "./usePendingCounts";
import {
  ArrowIcon,
  BadgeIcon,
  ChartRule,
  CheckinIcon,
  CloseIcon,
  GameIcon,
  MenuIcon,
  MuralIcon,
  ReticleIcon,
  SignOutIcon,
} from "./ui/atlas";

const TOOL_ICONS: Record<string, typeof CheckinIcon> = {
  "/admin/checkin": CheckinIcon,
  "/admin/credentials": BadgeIcon,
  "/admin/events/mural": MuralIcon,
  "/admin/events/minigames": GameIcon,
};

const PENDING_BY_HREF: Record<string, PendingKey> = {
  "/admin/proposals": "proposals",
  "/admin/access": "access",
  "/admin/posts": "drafts",
};

interface Props {
  currentPage: string;
  children: React.ReactNode;
}

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const first = name?.split(" ")[0];
  const salute =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  return first ? `${salute}, ${first}` : salute;
}

function ScrollingNav({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () =>
      setMore(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 8);
    update();
    nav.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      nav.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <nav
        ref={ref}
        aria-label="Secciones del panel"
        className="h-full overflow-y-auto px-3 pb-4"
      >
        {children}
      </nav>
      {more && (
        <div
          aria-hidden="true"
          className="from-atlas-night pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t to-transparent pb-2"
        >
          <span className="atlas-label text-atlas-glow flex items-center gap-1.5">
            Más secciones
            <ArrowIcon className="size-3.5 rotate-90" />
          </span>
        </div>
      )}
    </div>
  );
}

export function AdminShell({ currentPage, children }: Props) {
  const { user, role, profile, signOut, can, permissions } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(() => pageTitle(currentPage, false));
  const { events } = useEventCatalog();
  const pending = usePendingCounts(can);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSlug(params.get("slug"));
    setEditing(params.has("edit"));
    setTitle(
      currentPage === "/admin"
        ? greeting(user?.displayName)
        : pageTitle(currentPage, params.has("edit"))
    );
  }, [currentPage, user?.displayName]);

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    const opener = openerRef.current;
    drawer?.querySelector<HTMLElement>("button, a")?.focus();
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>("a, button");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [menuOpen]);

  // `can()` evalúa a alcance GLOBAL, y los permisos de un voluntario son todos
  // `perEvent`: su conjunto global está vacío. Filtrando solo por `can()`, un
  // voluntario entraba y veía únicamente el dashboard, sin un enlace al
  // check-in que es su único trabajo — mientras el servidor sí le habría dejado
  // operar su evento. La segunda condición abre esas entradas a quien pueda
  // alcanzarlas estando asignado; el evento concreto lo decide el servidor.
  const reaches = (permission?: Permission) =>
    !permission ||
    can(permission) ||
    (profile !== null && canReachByAssignment(profile, permission));

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => reaches(item.permission)),
  })).filter((group) => group.items.length > 0);

  const roleLabel = role ? (ROLE_LABELS[role as Role] ?? role) : null;
  const scope =
    permissions.size > 0 ? "Toda la comunidad" : "Tus eventos asignados";

  const liveMode = isEventTool(currentPage) && slug !== null;
  const liveEvent = slug ? events?.find((e) => e.slug === slug) : undefined;
  const liveTools = EVENT_TOOLS.filter((tool) => reaches(tool.permission));
  const countFor = (href: string) =>
    pending.find((p) => p.key === PENDING_BY_HREF[href])?.count ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextEvent = (events ?? [])
    .filter((e) => e.status !== "completed" && e.date && e.date >= today)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())[0];

  const activeHref =
    currentPage === "/admin/events/minigames"
      ? "/admin/minigame-templates"
      : currentPage === "/admin/events/new" ||
          currentPage === "/admin/events/staff"
        ? "/admin/events"
        : currentPage;

  const sidebar = (
    <>
      <a href="/admin" className="flex items-center gap-3 px-5 pt-6 pb-5">
        <img src="/gdg-logo.png" alt="" className="h-7 w-auto" />
        <span className="min-w-0">
          <span className="atlas-name text-atlas-dust block text-[1.375rem] leading-none">
            GDG ICA
          </span>
          <span className="text-atlas-fog mt-1 block text-xs">
            Panel de la comunidad
          </span>
        </span>
      </a>
      <ScrollingNav>
        {groups.map((group) => (
          <div key={group.label ?? "inicio"} className="mt-4 first:mt-1">
            {group.label && (
              <h3 className="atlas-label text-atlas-glow mb-1.5 flex items-center gap-2 px-2">
                {group.label}
                <span
                  className="bg-atlas-line h-px flex-1"
                  aria-hidden="true"
                />
              </h3>
            )}
            <ul>
              {group.items.map((item) => {
                const active = activeHref === item.href;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.9375rem] transition-colors ${
                        active
                          ? "bg-atlas-deep text-atlas-dust font-semibold"
                          : "text-atlas-mist hover:bg-atlas-deep/60 hover:text-atlas-dust"
                      }`}
                    >
                      <ReticleIcon
                        className={`size-4 shrink-0 ${
                          active
                            ? "atlas-reticle-in text-atlas-star"
                            : "group-hover:text-atlas-line text-transparent"
                        }`}
                      />
                      <span className="flex-1">{item.label}</span>
                      {countFor(item.href) > 0 && (
                        <span className="text-atlas-star text-xs font-semibold tabular-nums">
                          {countFor(item.href)}
                          <span className="sr-only"> pendientes</span>
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </ScrollingNav>
      <div className="border-atlas-line border-t px-5 py-4">
        <div className="flex items-center gap-3">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="size-8 rounded-full" />
          ) : (
            <span className="atlas-name border-atlas-line text-atlas-dust grid size-8 place-items-center rounded-full border">
              {user?.displayName?.charAt(0) ?? "·"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-atlas-dust truncate text-sm font-semibold">
              {user?.displayName ?? user?.email}
            </p>
            {roleLabel && (
              <p className="text-atlas-fog truncate text-xs">{roleLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="text-atlas-mist hover:bg-atlas-deep hover:text-atlas-dust rounded-md p-1.5 transition-colors"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <SignOutIcon className="size-[18px]" />
          </button>
        </div>
        <a
          href="/"
          className="text-atlas-mist hover:text-atlas-dust mt-3 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          Ver el sitio público
          <ArrowIcon className="size-3.5" />
        </a>
      </div>
    </>
  );

  return (
    <div className="bg-atlas-night text-atlas-dust flex h-screen overflow-hidden">
      <a
        href="#contenido"
        className="bg-atlas-ember sr-only z-50 rounded-md px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>

      <aside className="border-atlas-line bg-atlas-night hidden w-[248px] shrink-0 flex-col border-r lg:flex">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="bg-atlas-night/80 absolute inset-0"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú del panel"
            className="border-atlas-line bg-atlas-night absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col border-r"
          >
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="text-atlas-mist hover:bg-atlas-deep hover:text-atlas-dust absolute top-4 right-3 rounded-md p-1.5"
              aria-label="Cerrar menú"
            >
              <CloseIcon />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`border-atlas-line border-b ${
            liveMode ? "bg-atlas-deep" : "bg-atlas-night"
          }`}
        >
          <div className="flex flex-wrap items-start gap-3 px-4 pt-4 pb-4 sm:flex-nowrap sm:px-8 sm:pt-6">
            <button
              ref={openerRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              className="text-atlas-mist hover:bg-atlas-deep hover:text-atlas-dust -ml-1 rounded-md p-1.5 lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
            >
              <MenuIcon className="size-6" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="atlas-name text-atlas-dust text-[1.75rem] leading-[1.05] sm:text-[2.25rem]">
                {liveMode ? (liveEvent?.name ?? slug) : title}
              </h1>
              <p className="text-atlas-fog mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {liveMode ? (
                  <>
                    <span className="text-atlas-glow flex items-center gap-2 font-semibold">
                      <span className="relative flex size-2" aria-hidden="true">
                        <span className="bg-atlas-star absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
                        <span className="bg-atlas-star relative inline-flex size-2 rounded-full" />
                      </span>
                      En vivo
                      <span id="admin-header-status" className="contents" />
                    </span>
                    <span>
                      Herramienta{" "}
                      <b className="text-atlas-mist font-semibold">{title}</b>
                    </span>
                    {liveEvent?.date && (
                      <time
                        dateTime={liveEvent.date.toISOString()}
                        className="text-atlas-mist"
                      >
                        {liveEvent.date.toLocaleDateString("es-PE", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {liveEvent.place ? ` · ${liveEvent.place}` : ""}
                      </time>
                    )}
                  </>
                ) : (
                  <>
                    {roleLabel && (
                      <span>
                        Rol{" "}
                        <b className="text-atlas-mist font-semibold">
                          {roleLabel}
                        </b>
                      </span>
                    )}
                    <span>
                      Alcance{" "}
                      <b className="text-atlas-mist font-semibold">{scope}</b>
                    </span>
                    {nextEvent && (
                      <span>
                        Próximo evento{" "}
                        <b className="text-atlas-mist font-semibold">
                          {nextEvent.name} ·{" "}
                          <time dateTime={nextEvent.date!.toISOString()}>
                            {nextEvent.date!.toLocaleDateString("es-PE", {
                              day: "numeric",
                              month: "short",
                            })}
                          </time>
                        </b>
                      </span>
                    )}
                    {editing && slug === null && (
                      <span className="text-atlas-glow">Editando</span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div
              id="admin-header-actions"
              className="flex shrink-0 flex-wrap gap-2 empty:hidden max-sm:w-full max-sm:pl-10 sm:justify-end sm:self-center"
            />
          </div>
          {liveMode && liveTools.length > 1 && (
            <nav
              aria-label="Herramientas del evento"
              className="hidden gap-1 px-8 sm:flex"
            >
              {liveTools.map((tool) => {
                const active = tool.href === currentPage;
                return (
                  <a
                    key={tool.href}
                    href={`${tool.href}?slug=${encodeURIComponent(slug!)}`}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px border-b-2 px-3 pb-3 text-sm font-semibold transition-colors ${
                      active
                        ? "border-atlas-star text-atlas-dust"
                        : "text-atlas-mist hover:text-atlas-dust border-transparent"
                    }`}
                  >
                    {tool.label}
                  </a>
                );
              })}
            </nav>
          )}
          {!liveMode && (
            <ChartRule className="-mb-[3.5px] pl-4 lg:-ml-[3.5px] lg:pl-0" />
          )}
        </header>

        <main
          id="contenido"
          tabIndex={-1}
          className={`min-w-0 flex-1 overflow-auto px-4 py-6 focus:outline-none sm:px-8 ${
            liveMode ? "pb-24 sm:pb-6" : ""
          }`}
        >
          {children}
        </main>

        {liveMode && liveTools.length > 1 && (
          <nav
            aria-label="Herramientas del evento"
            className="border-atlas-line bg-atlas-night/95 fixed inset-x-0 bottom-0 z-30 grid border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
            style={{ gridTemplateColumns: `repeat(${liveTools.length}, 1fr)` }}
          >
            {liveTools.map((tool) => {
              const active = tool.href === currentPage;
              const ToolIcon = active
                ? ReticleIcon
                : (TOOL_ICONS[tool.href] ?? ReticleIcon);
              return (
                <a
                  key={tool.href}
                  href={`${tool.href}?slug=${encodeURIComponent(slug!)}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                    active ? "text-atlas-dust" : "text-atlas-mist"
                  }`}
                >
                  <ToolIcon
                    className={`size-5 ${active ? "atlas-reticle-in text-atlas-star" : "text-atlas-mist"}`}
                  />
                  {tool.label}
                </a>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";
import { canReachByAssignment, type Permission } from "@/lib/permissions";
import { EVENT_TOOLS } from "./nav";
import { useEventCatalog, type CatalogEvent } from "./useEventCatalog";
import { usePendingCounts } from "./usePendingCounts";
import {
  ArrowIcon,
  CornerNodes,
  ErrorState,
  HeaderActions,
  LoadingState,
  ReticleIcon,
  SectionHeading,
  buttonClass,
} from "./ui/atlas";

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 120;

interface Assignment {
  eventSlug: string;
  role: string | null;
}

function magnitude(participants: number): number {
  if (participants >= 250) return 18;
  if (participants >= 100) return 13;
  if (participants > 0) return 9;
  return 6;
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api
      .listMyEvents()
      .then((res) => {
        if (cancelled) return;
        if (!res.success) return setFailed(true);
        setAssignments((res.data ?? []) as Assignment[]);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { assignments, failed, retry: () => setAttempt((n) => n + 1) };
}

function Ephemeris({
  events,
  assigned,
}: {
  events: CatalogEvent[];
  assigned: Set<string>;
}) {
  const start = startOfToday();
  const end = start + WINDOW_DAYS * DAY;
  const visible = events
    .filter(
      (e) => e.date && e.date.getTime() >= start && e.date.getTime() <= end
    )
    .sort((a, b) => a.date!.getTime() - b.date!.getTime());

  const months: { label: string; left: number }[] = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() < end) {
    months.push({
      label: cursor.toLocaleDateString("es-PE", { month: "short" }),
      left: ((cursor.getTime() - start) / (end - start)) * 100,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <figure className="border-atlas-line bg-atlas-deep/40 relative rounded-xs border">
      <CornerNodes />
      <figcaption className="border-atlas-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <span className="atlas-label text-atlas-glow">
          Próximos {WINDOW_DAYS} días
        </span>
        <span className="text-atlas-fog flex items-center gap-3 text-xs">
          Magnitud = inscritos
          {[6, 9, 13, 18].map((size) => (
            <span
              key={size}
              className="bg-atlas-dust inline-block rounded-full"
              style={{ width: size / 1.5, height: size / 1.5 }}
              aria-hidden="true"
            />
          ))}
          <span className="flex items-center gap-1">
            <ReticleIcon className="text-atlas-star size-4" />
            tu evento
          </span>
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <div className="relative h-44 min-w-[640px]">
          {[25, 50, 75].map((y) => (
            <span
              key={y}
              className="bg-atlas-line/40 absolute inset-x-0 h-px"
              style={{ top: `${y}%` }}
              aria-hidden="true"
            />
          ))}
          {months.map((m) => (
            <span
              key={m.left}
              className="border-atlas-line/70 absolute top-0 bottom-0 border-l border-dashed"
              style={{ left: `${m.left}%` }}
              aria-hidden="true"
            >
              <span className="atlas-label text-atlas-fog absolute bottom-2 left-1.5">
                {m.label}
              </span>
            </span>
          ))}
          <span
            className="border-atlas-star/60 absolute top-0 bottom-0 left-0 border-l"
            aria-hidden="true"
          >
            <span className="atlas-label text-atlas-star absolute top-2 left-1.5">
              Hoy
            </span>
          </span>
          {visible.length === 0 && (
            <p className="text-atlas-fog absolute inset-0 grid place-items-center text-sm">
              No hay eventos en los próximos {WINDOW_DAYS} días.
            </p>
          )}
          <ol>
            {visible.map((event, index) => {
              const left =
                ((event.date!.getTime() - start) / (end - start)) * 100;
              const size = magnitude(event.participants);
              const top = index % 2 === 0 ? 38 : 64;
              const mine = assigned.has(event.slug);
              return (
                <li
                  key={event.slug}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
                  style={{
                    left: `max(1.5rem, min(${left}%, calc(100% - 12rem)))`,
                    top: `${top}%`,
                  }}
                >
                  <span className="relative grid size-8 place-items-center">
                    {mine && (
                      <ReticleIcon className="atlas-reticle-in text-atlas-star absolute size-8" />
                    )}
                    <span
                      className="bg-atlas-dust rounded-full"
                      style={{ width: size, height: size }}
                    />
                  </span>
                  <span className="ml-1.5 whitespace-nowrap">
                    <span className="atlas-name text-atlas-dust block text-[1.0625rem] leading-tight">
                      {event.name}
                    </span>
                    <time
                      dateTime={event.date!.toISOString()}
                      className="text-atlas-fog block text-xs"
                    >
                      {event.date!.toLocaleDateString("es-PE", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · {event.participants} inscritos
                    </time>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </figure>
  );
}

function EventRow({
  event,
  slug,
  reaches,
  canEdit,
}: {
  event: CatalogEvent | undefined;
  slug: string;
  reaches: (p: Permission) => boolean;
  canEdit: boolean;
}) {
  const tools = EVENT_TOOLS.filter((t) => reaches(t.permission));
  const [primary, ...rest] = tools;
  const date = event?.date;
  const live = !!date && Math.abs(date.getTime() - startOfToday()) <= DAY;
  const href = (path: string) => `${path}?slug=${encodeURIComponent(slug)}`;

  return (
    <li className="border-atlas-line grid grid-cols-[4.5rem_1fr] gap-x-5 gap-y-4 border-b py-5 last:border-b-0 @3xl:grid-cols-[4.5rem_1fr_auto] @3xl:items-center">
      <div className="border-atlas-line row-span-2 self-start border-r pr-4 text-center @3xl:row-span-1 @3xl:self-center">
        {date ? (
          <time dateTime={date.toISOString()}>
            <span className="text-atlas-dust block text-[2rem] leading-none font-semibold">
              {date.getDate()}
            </span>
            <span className="atlas-label text-atlas-fog">
              {date.toLocaleDateString("es-PE", { month: "short" })}
            </span>
          </time>
        ) : (
          <span className="atlas-label text-atlas-fog">Sin fecha</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {event?.name ?? slug}
        </p>
        {event ? (
          <>
            {event.place && (
              <p className="text-atlas-mist mt-1 text-sm">{event.place}</p>
            )}
            <p className="text-atlas-fog mt-0.5 text-sm">
              {[
                event.time,
                event.maxParticipants
                  ? `${event.participants}/${event.maxParticipants} inscritos`
                  : `${event.participants} inscritos`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        ) : (
          <p className="text-atlas-fog mt-1 text-sm">
            Evento sin ficha publicada todavía
          </p>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap gap-2 @3xl:col-start-auto @3xl:justify-end">
        {canEdit && (
          <a
            href={`/admin/events/new?edit=${encodeURIComponent(slug)}`}
            className={buttonClass.secondary}
          >
            Editar
          </a>
        )}
        {rest.slice(0, canEdit ? 1 : 2).map((tool) => (
          <a
            key={tool.href}
            href={href(tool.href)}
            className={buttonClass.secondary}
          >
            {tool.label}
          </a>
        ))}
        {primary && (
          <a
            href={href(primary.href)}
            className={live ? buttonClass.primary : buttonClass.secondary}
          >
            Abrir {primary.label.toLowerCase()}
          </a>
        )}
      </div>
    </li>
  );
}

export function Dashboard() {
  const { can, profile, permissions } = useAuth();
  const catalog = useEventCatalog();
  const mine = useAssignments();
  const pending = usePendingCounts(can);

  const reaches = (permission: Permission) =>
    can(permission) ||
    (profile !== null && canReachByAssignment(profile, permission));

  const assigned = new Set((mine.assignments ?? []).map((a) => a.eventSlug));
  const today = startOfToday();
  const upcoming = (catalog.events ?? [])
    .filter(
      (e) =>
        e.status !== "completed" && (!e.date || e.date.getTime() >= today - DAY)
    )
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const global = permissions.size > 0;
  const rowSlugs = global
    ? [...new Set([...assigned, ...upcoming.slice(0, 4).map((e) => e.slug)])]
    : [...assigned];
  const bySlug = new Map((catalog.events ?? []).map((e) => [e.slug, e]));
  const rows = rowSlugs
    .map((slug) => ({ slug, event: bySlug.get(slug) }))
    .sort(
      (a, b) =>
        (a.event?.date?.getTime() ?? Infinity) -
        (b.event?.date?.getTime() ?? Infinity)
    );

  const chartEvents = global
    ? upcoming
    : upcoming.filter((e) => assigned.has(e.slug));

  const loadingRows =
    mine.assignments === null && !mine.failed && catalog.events === null;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {(can("events:write") ||
        can("posts:write") ||
        can("proposals:create")) && (
        <HeaderActions>
          {can("posts:write") && (
            <a href="/admin/posts" className={buttonClass.secondary}>
              Escribir post
            </a>
          )}
          {!can("events:write") && can("proposals:create") && (
            <a href="/admin/proposals" className={buttonClass.primary}>
              Nueva propuesta
            </a>
          )}
          {can("events:write") && (
            <a href="/admin/events/new" className={buttonClass.primary}>
              Nuevo evento
            </a>
          )}
        </HeaderActions>
      )}

      {catalog.failed ? (
        <ErrorState
          message="No se pudo cargar el calendario de eventos del sitio."
          onRetry={catalog.retry}
        />
      ) : catalog.events === null ? (
        <LoadingState label="Cargando el calendario…" />
      ) : (
        (global || assigned.size > 0) && (
          <Ephemeris events={chartEvents} assigned={assigned} />
        )
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="tus-eventos" className="@container">
          <SectionHeading>
            <span id="tus-eventos">
              {global ? "Próximos eventos" : "Tus eventos"}
            </span>
          </SectionHeading>
          {mine.failed && (
            <div className="mb-4">
              <ErrorState
                message="No se pudieron cargar tus asignaciones de staff."
                onRetry={mine.retry}
              />
            </div>
          )}
          {loadingRows ? (
            <LoadingState label="Cargando eventos…" />
          ) : rows.length === 0 ? (
            <p className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-6 text-sm">
              {global
                ? "No hay eventos próximos. Cuando crees uno aparecerá aquí."
                : "Todavía no estás asignado a ningún evento. Pide a un organizador que te sume al staff del evento que vas a trabajar."}
            </p>
          ) : (
            <ul>
              {rows.map(({ slug, event }) => (
                <EventRow
                  key={slug}
                  slug={slug}
                  event={event}
                  reaches={(p) => (assigned.has(slug) ? reaches(p) : can(p))}
                  canEdit={can("events:write")}
                />
              ))}
            </ul>
          )}
        </section>

        {pending.length > 0 && (
          <section aria-labelledby="te-esperan">
            <SectionHeading>
              <span id="te-esperan">Te esperan</span>
            </SectionHeading>
            <ul className="border-atlas-line relative rounded-xs border">
              <CornerNodes />
              {pending.map((item) => (
                <li
                  key={item.key}
                  className="border-atlas-line border-b last:border-b-0"
                >
                  <a
                    href={item.href}
                    className="group hover:bg-atlas-deep/60 flex items-center gap-4 px-5 py-4 transition-colors"
                  >
                    <span
                      className={`w-10 text-[1.75rem] leading-none font-semibold tabular-nums ${
                        item.count ? "text-atlas-star" : "text-atlas-fog"
                      }`}
                    >
                      {item.failed ? "—" : (item.count ?? "·")}
                    </span>
                    <span className="text-atlas-dust flex-1 text-[0.9375rem]">
                      {item.label}
                      {item.failed && (
                        <span className="text-atlas-rose block text-xs">
                          No se pudo contar
                        </span>
                      )}
                    </span>
                    <ArrowIcon className="text-atlas-fog group-hover:text-atlas-dust size-4 transition-colors" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

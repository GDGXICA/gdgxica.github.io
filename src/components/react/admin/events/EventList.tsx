import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Toast } from "../ui/Toast";
import {
  ErrorState,
  HeaderActions,
  LoadingState,
  SectionHeading,
  buttonClass,
} from "../ui/atlas";

interface EventSummary {
  id: string;
  title: string;
  date: string;
  venue: string;
  topics: string[];
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function EventRow({
  event,
  deleting,
  onDelete,
}: {
  event: EventSummary;
  deleting: boolean;
  onDelete: () => void;
}) {
  const date = parseDate(event.date);
  const slug = encodeURIComponent(event.id);

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
            <span className="text-atlas-fog block text-xs tabular-nums">
              {date.getFullYear()}
            </span>
          </time>
        ) : (
          <span className="atlas-label text-atlas-fog">Sin fecha</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="atlas-name text-atlas-dust text-xl leading-tight">
          {event.title || event.id}
        </p>
        <p className="text-atlas-mist mt-1 text-sm">
          {event.venue || "Virtual"}
          {date &&
            ` · ${date.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
        </p>
        <p className="text-atlas-fog mt-0.5 text-xs">/events/{event.id}</p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 @3xl:col-start-auto @3xl:justify-end">
        <a
          href={`/admin/events/new?edit=${slug}`}
          className={buttonClass.secondary}
        >
          Editar
        </a>
        <a
          href={`/admin/events/minigames?slug=${slug}`}
          className={buttonClass.quiet}
        >
          Minijuegos
        </a>
        <a
          href={`/admin/events/staff?slug=${slug}`}
          className={buttonClass.quiet}
        >
          Staff
        </a>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="text-atlas-rose hover:bg-atlas-rose/10 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {deleting ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </li>
  );
}

export function EventList() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    setError(false);
    const res = await api.listEvents();
    if (res.success && res.data) {
      setEvents(res.data as EventSummary[]);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  async function handleDelete(event: EventSummary) {
    if (
      !confirm(
        `¿Eliminar el evento «${event.title || event.id}»? Su ficha desaparecerá del sitio público.`
      )
    )
      return;
    setDeleting(event.id);
    const res = await api.deleteEvent(event.id);
    if (res.success) {
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      setToast({ message: "Evento eliminado", type: "success" });
    } else {
      setToast({
        message: "No se pudo eliminar el evento. Inténtalo de nuevo.",
        type: "error",
      });
    }
    setDeleting(null);
  }

  const now = Date.now();
  const sorted = [...events].sort(
    (a, b) =>
      (parseDate(a.date)?.getTime() ?? 0) - (parseDate(b.date)?.getTime() ?? 0)
  );
  const upcoming = sorted.filter(
    (e) => (parseDate(e.date)?.getTime() ?? Infinity) >= now
  );
  const past = sorted
    .filter((e) => (parseDate(e.date)?.getTime() ?? Infinity) < now)
    .reverse();

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <HeaderActions>
        <a href="/admin/events/new" className={buttonClass.primary}>
          Nuevo evento
        </a>
      </HeaderActions>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {loading ? (
        <LoadingState label="Cargando eventos…" />
      ) : error ? (
        <ErrorState
          message="No se pudieron cargar los eventos. Suele ser la conexión con el repositorio de datos."
          onRetry={loadEvents}
        />
      ) : events.length === 0 ? (
        <div className="border-atlas-line text-atlas-mist rounded-xs border border-dashed px-5 py-8 text-sm">
          Todavía no hay eventos.{" "}
          <a
            href="/admin/events/new"
            className="text-atlas-dust font-semibold underline underline-offset-4"
          >
            Crea el primero
          </a>
          .
        </div>
      ) : (
        [
          { id: "proximos", label: "Próximos", list: upcoming },
          { id: "pasados", label: "Pasados", list: past },
        ]
          .filter((group) => group.list.length > 0)
          .map((group) => (
            <section
              key={group.id}
              aria-labelledby={`eventos-${group.id}`}
              className="@container"
            >
              <SectionHeading
                action={
                  <span className="text-atlas-fog text-sm tabular-nums">
                    {group.list.length}{" "}
                    {group.list.length === 1 ? "evento" : "eventos"}
                  </span>
                }
              >
                <span id={`eventos-${group.id}`}>{group.label}</span>
              </SectionHeading>
              <ul>
                {group.list.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    deleting={deleting === event.id}
                    onDelete={() => handleDelete(event)}
                  />
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}

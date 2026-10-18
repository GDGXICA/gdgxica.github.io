import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../AuthProvider";
import { useEventCatalog } from "../useEventCatalog";
import { ArrowIcon, ErrorState, LoadingState, SectionHeading } from "./atlas";

/**
 * Elige el evento cuando la URL no lo trae.
 *
 * Las tres pantallas acotadas a un evento —check-in, credenciales y
 * minijuegos— sacaban el slug exclusivamente de `?slug=` y, si faltaba,
 * enseñaban un mensaje pidiendo que lo escribieras a mano. Servía a medias para
 * un organizador, que se sabe los slugs; para un voluntario era una puerta
 * cerrada, porque su rol tampoco le da `events:read` para consultarlos.
 *
 * De ahí las dos fuentes: quien pueda listar eventos los lista, y quien no,
 * recibe los suyos de `GET /api/me/events` — que devuelve solo las asignaciones
 * vigentes de quien llama. Ese endpoint existía desde que hay staff por evento
 * y no lo llamaba ningún componente; es exactamente el hueco que faltaba.
 */

interface EventOption {
  slug: string;
  title: string;
  /** Solo en los asignados: hasta cuándo dura la asignación. */
  expiresAt?: string | null;
}

interface Props {
  /** Ruta a la que volver con el slug puesto, p. ej. `/admin/checkin`. */
  basePath: string;
  /** Qué se va a hacer con el evento, para el encabezado. */
  title: string;
}

/** Normaliza la fecha que llega de Firestore por JSON. */
function toDateLabel(value: unknown): string | null {
  if (!value) return null;
  const raw =
    typeof value === "object" && value !== null && "_seconds" in value
      ? new Date((value as { _seconds: number })._seconds * 1000)
      : new Date(value as string);
  return Number.isNaN(raw.getTime()) ? null : raw.toLocaleDateString("es-PE");
}

export function EventPicker({ basePath, title }: Props) {
  const { can } = useAuth();
  const [options, setOptions] = useState<EventOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const catalog = useEventCatalog();

  // Quien tiene `events:read` ve el catálogo entero; quien no, solo lo suyo.
  // No es una optimización: para un voluntario `/api/events` responde 403, así
  // que pedirlo primero y caer al otro sería un 403 garantizado en cada carga
  // — y cada 403 escribe un evento de seguridad en el registro.
  const canListAll = can("events:read");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (canListAll) {
          const res = await api.listEvents();
          if (cancelled) return;
          if (!res.success) {
            setError(res.error || "No se pudieron cargar los eventos");
            return;
          }
          const events = (res.data ?? []) as { id: string; title?: string }[];
          setOptions(
            events.map((e) => ({ slug: e.id, title: e.title || e.id }))
          );
          return;
        }

        const res = await api.listMyEvents();
        if (cancelled) return;
        if (!res.success) {
          setError(res.error || "No se pudieron cargar tus eventos");
          return;
        }
        const assignments = (res.data ?? []) as {
          eventSlug: string;
          expiresAt?: unknown;
        }[];
        setOptions(
          assignments.map((a) => ({
            slug: a.eventSlug,
            // El endpoint devuelve la asignación, no el evento, así que no hay
            // título que enseñar. El slug es legible y es lo que la persona ve
            // en la URL de todos modos.
            title: a.eventSlug,
            expiresAt: toDateLabel(a.expiresAt),
          }))
        );
      } catch {
        if (!cancelled) setError("No se pudieron cargar los eventos");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canListAll]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (options === null) {
    return <LoadingState label="Cargando eventos…" />;
  }

  if (options.length === 0) {
    return (
      <div className="border-atlas-line text-atlas-mist max-w-xl rounded-xs border border-dashed px-5 py-6 text-sm">
        <p className="text-atlas-dust font-semibold">
          No tienes eventos asignados.
        </p>
        <p className="mt-1">
          {canListAll
            ? "Todavía no hay eventos creados."
            : "Pide a un organizador que te asigne al evento que vas a trabajar."}
        </p>
      </div>
    );
  }

  const named = options.map((option) => {
    const entry = catalog.events?.find((e) => e.slug === option.slug);
    return {
      ...option,
      name: entry?.name ?? option.title,
      date: entry?.date ?? null,
      upcoming: entry ? entry.status !== "completed" : true,
    };
  });
  named.sort(
    (a, b) =>
      Number(b.upcoming) - Number(a.upcoming) ||
      (a.upcoming ? 1 : -1) *
        ((a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
  );

  return (
    <section aria-labelledby="event-picker-title" className="max-w-3xl">
      <SectionHeading>
        <span id="event-picker-title">Elige el evento</span>
      </SectionHeading>
      <p className="text-atlas-mist mb-4 text-sm">
        {title} trabaja sobre un evento a la vez.
      </p>
      <ul className="border-atlas-line rounded-xs border">
        {named.map((option) => (
          <li
            key={option.slug}
            className="border-atlas-line border-b last:border-b-0"
          >
            <a
              href={`${basePath}?slug=${encodeURIComponent(option.slug)}`}
              className="group hover:bg-atlas-deep/60 flex items-center gap-4 px-5 py-4 transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="atlas-name text-atlas-dust block text-lg leading-tight">
                  {option.name}
                </span>
                <span className="text-atlas-fog mt-0.5 block text-xs">
                  {[
                    option.date?.toLocaleDateString("es-PE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                    option.slug !== option.name ? option.slug : null,
                    option.expiresAt
                      ? `asignado hasta el ${option.expiresAt}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <ArrowIcon className="text-atlas-fog group-hover:text-atlas-dust size-4 shrink-0 transition-colors" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

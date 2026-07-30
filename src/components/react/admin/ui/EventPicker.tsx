import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../AuthProvider";

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
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (options === null) {
    return (
      <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Cargando eventos…
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <p className="font-medium">No tienes eventos asignados.</p>
        <p className="mt-1 text-sm">
          {canListAll
            ? "Todavía no hay eventos creados."
            : "Pide a un organizador que te asigne al evento que vas a trabajar."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="font-medium text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Elige el evento.
      </p>
      <ul className="mt-4 space-y-2">
        {options.map((option) => (
          <li key={option.slug}>
            <a
              href={`${basePath}?slug=${encodeURIComponent(option.slug)}`}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                {option.title}
              </span>
              {option.expiresAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  hasta el {option.expiresAt}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

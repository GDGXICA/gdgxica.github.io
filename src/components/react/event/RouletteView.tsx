import { useRouletteParticipants } from "./useRouletteParticipants";
import type { LiveInstance } from "./types";

interface Props {
  slug: string;
  instanceId: string;
  uid: string;
  title: string;
  instance: LiveInstance;
}

export function RouletteView({
  slug,
  instanceId,
  uid,
  title,
  instance,
}: Props) {
  const { eligible, winners, loading } = useRouletteParticipants(
    slug,
    instanceId
  );

  const myWin = winners.find((w) => w.uid === uid);
  const prize = instance.config?.prize as string | undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="m-0 text-[clamp(1.6rem,1.3rem+1.4vw,2.25rem)] leading-tight font-semibold tracking-[-0.02em] text-(--ink)">
        {title}
      </h2>

      {prize && (
        <p className="mt-2 text-(--muted)">
          Premio: <span className="font-semibold text-(--ink)">{prize}</span>
        </p>
      )}

      {myWin ? (
        <div
          className="mt-8 rounded-(--radius) border border-(--ochre) bg-(--surface-2) px-6 py-10 text-center"
          role="status"
        >
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-(--radius-sm) bg-(--ochre) text-3xl font-bold text-(--ochre-ink)"
            aria-hidden="true"
          >
            ✓
          </span>
          <p className="mt-5 font-(family-name:--font-display) text-[2.5rem] leading-none font-bold text-(--ink)">
            ¡Ganaste!
          </p>
          <p className="mt-3 text-(--muted)">
            Preséntate con el organizador para reclamar tu premio.
          </p>
        </div>
      ) : (
        <div
          className="mt-8 rounded-(--radius) border border-(--line) bg-(--surface-2) px-6 py-10 text-center"
          role="status"
        >
          <span
            className="mx-auto block h-2.5 w-2.5 animate-pulse rounded-full bg-(--ochre) motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-(--ink)">
            Estás en la ruleta
          </p>
          {loading ? (
            <p className="mt-2 text-(--muted)">Cargando participantes…</p>
          ) : (
            <p className="mt-3 font-mono text-[0.9375rem] text-(--ochre) tabular-nums">
              {eligible.length} participante{eligible.length !== 1 && "s"}{" "}
              elegibles · {winners.length} ganador{winners.length !== 1 && "es"}
            </p>
          )}
          <p className="mt-4 text-[0.9375rem] text-(--muted)">
            Mira la pantalla del evento para seguir el giro.
          </p>
        </div>
      )}

      {winners.length > 0 && (
        <div className="mt-8 border-t border-(--line) pt-5">
          <h3 className="mt-0 mb-3 text-lg font-semibold text-(--ink)">
            Ganadores anteriores
          </h3>
          <ol className="divide-y divide-(--line)">
            {winners.map((w, i) => (
              <li
                key={w.uid}
                className={`flex min-h-12 items-center gap-3 px-1 ${
                  w.uid === uid
                    ? "font-semibold text-(--ochre)"
                    : "text-(--ink)"
                }`}
              >
                <span
                  className="font-mono text-sm text-(--muted) tabular-nums"
                  aria-hidden="true"
                >
                  {i + 1}.
                </span>
                {w.alias}
                {w.uid === uid && " (tú)"}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

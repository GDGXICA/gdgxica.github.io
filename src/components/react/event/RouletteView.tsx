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
      <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h2>

      {prize && (
        <p className="mt-2 text-base text-gray-700 dark:text-gray-300">
          Premio: <span className="font-semibold">{prize}</span>
        </p>
      )}

      {myWin ? (
        <div
          className="mt-8 rounded-xl bg-green-50 p-8 text-center dark:bg-green-950/50"
          role="status"
        >
          <span
            className="bg-google-green mx-auto flex h-14 w-14 items-center justify-center rounded-full text-3xl font-bold text-white"
            aria-hidden="true"
          >
            ✓
          </span>
          <p className="mt-4 text-3xl font-bold text-green-900 dark:text-green-200">
            ¡Ganaste!
          </p>
          <p className="mt-2 text-base text-green-800 dark:text-green-200">
            Preséntate con el organizador para reclamar tu premio.
          </p>
        </div>
      ) : (
        <div
          className="mt-8 rounded-xl bg-gray-100 p-8 text-center dark:bg-gray-800"
          role="status"
        >
          <div className="mx-auto flex w-fit gap-2" aria-hidden="true">
            <span className="bg-google-blue h-3 w-3 rounded-full" />
            <span className="bg-google-red h-3 w-3 rounded-full" />
            <span className="bg-google-yellow h-3 w-3 rounded-full" />
            <span className="bg-google-green h-3 w-3 rounded-full" />
          </div>
          <p className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
            Estás en la ruleta
          </p>
          {loading ? (
            <p className="mt-2 text-base text-gray-700 dark:text-gray-300">
              Cargando participantes…
            </p>
          ) : (
            <p className="mt-2 text-base text-gray-700 tabular-nums dark:text-gray-300">
              {eligible.length} participante{eligible.length !== 1 && "s"}{" "}
              elegibles · {winners.length} ganador{winners.length !== 1 && "es"}
            </p>
          )}
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Mira la pantalla del evento para seguir el giro.
          </p>
        </div>
      )}

      {winners.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-5 dark:border-gray-700">
          <h3 className="mb-3 font-bold text-gray-900 dark:text-white">
            Ganadores anteriores
          </h3>
          <ol className="space-y-2">
            {winners.map((w, i) => (
              <li
                key={w.uid}
                className={`flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 text-base dark:bg-gray-800 ${
                  w.uid === uid
                    ? "font-bold text-green-700 dark:text-green-400"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <span
                  className="text-sm font-bold tabular-nums"
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

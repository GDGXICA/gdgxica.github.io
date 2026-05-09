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
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold tracking-widest text-rose-700 uppercase dark:text-rose-300">
          Ruleta
        </span>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      </div>

      {prize && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Premio: <span className="font-medium">{prize}</span>
        </p>
      )}

      {myWin ? (
        <div className="rounded-xl border border-green-300 bg-green-50 p-6 text-center dark:border-green-700 dark:bg-green-900/20">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <p className="mt-2 text-xl font-bold text-green-800 dark:text-green-300">
            ¡Ganaste!
          </p>
          <p className="mt-1 text-sm text-green-700 dark:text-green-400">
            Preséntate con el organizador para reclamar tu premio.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/50">
          <p className="text-3xl" aria-hidden>
            🎯
          </p>
          <p className="mt-2 font-semibold text-gray-800 dark:text-gray-200">
            Estás en la ruleta
          </p>
          {loading ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Cargando participantes...
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {eligible.length} participante{eligible.length !== 1 && "s"}{" "}
              elegibles · {winners.length} ganador{winners.length !== 1 && "es"}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Espera a que el organizador gire la ruleta
          </p>
        </div>
      )}

      {winners.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
            Ganadores anteriores
          </p>
          <ol className="space-y-1">
            {winners.map((w, i) => (
              <li
                key={w.uid}
                className={`flex items-center gap-2 text-sm ${
                  w.uid === uid
                    ? "font-bold text-green-700 dark:text-green-400"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <span aria-hidden>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎉"}
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

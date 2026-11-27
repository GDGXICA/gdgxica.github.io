import { inputClass, type RouletteConfig } from "../types";

interface Props {
  value: RouletteConfig;
  onChange: (next: RouletteConfig) => void;
}

export function RouletteFields({ value, onChange }: Props) {
  const winnersCount = value.winnersCount ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <label
            htmlFor="roulette-prize"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Premio (opcional)
          </label>
          <input
            id="roulette-prize"
            type="text"
            value={value.prize ?? ""}
            onChange={(e) => onChange({ ...value, prize: e.target.value })}
            placeholder="Ej. Camiseta GDG ICA, Stickers, ..."
            maxLength={120}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Se muestra en el proyector y a los participantes.
          </p>
        </div>

        <div>
          <label
            htmlFor="roulette-winners-count"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Cantidad de ganadores
          </label>
          <input
            id="roulette-winners-count"
            type="number"
            min={1}
            max={20}
            value={winnersCount}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              const clamped = Number.isNaN(parsed)
                ? 1
                : Math.max(1, Math.min(20, parsed));
              onChange({ ...value, winnersCount: clamped });
            }}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Al completarlos se muestra la tabla final.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
        <p className="font-medium">¿Cómo funciona la ruleta?</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Los asistentes se unen escaneando el QR del proyector y registrando
            su nombre.
          </li>
          <li>
            El organizador gira la ruleta desde el panel de mini-juegos del
            evento; el ganador se revela solo al detenerse la rueda.
          </li>
          <li>
            Se elige un ganador al azar entre los participantes que aún no han
            ganado.
          </li>
          <li>
            Al alcanzar la cantidad de ganadores configurada (o al cerrar la
            ruleta), el proyector y los teléfonos muestran la tabla final de
            ganadores.
          </li>
        </ul>
      </div>
    </div>
  );
}

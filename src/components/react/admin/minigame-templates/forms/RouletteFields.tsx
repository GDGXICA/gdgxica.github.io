import { inputClass, type RouletteConfig } from "../types";

interface Props {
  value: RouletteConfig;
  onChange: (next: RouletteConfig) => void;
}

export function RouletteFields({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Premio (opcional)
        </label>
        <input
          type="text"
          value={value.prize ?? ""}
          onChange={(e) => onChange({ ...value, prize: e.target.value })}
          placeholder="Ej. Camiseta GDG ICA, Stickers, ..."
          maxLength={120}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Se muestra a los participantes mientras esperan el giro.
        </p>
      </div>
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
        <p className="font-medium">¿Cómo funciona la ruleta?</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Los asistentes se unen escaneando el QR del proyector y registrando
            su nombre.
          </li>
          <li>
            El admin gira la ruleta desde el panel de mini-juegos del evento.
          </li>
          <li>
            Se elige un ganador al azar entre los participantes que aún no han
            ganado.
          </li>
          <li>
            Puedes girar la ruleta varias veces para elegir múltiples ganadores.
          </li>
        </ul>
      </div>
    </div>
  );
}

interface Props {
  present: number;
  total: number;
  /** True only when actually disconnected — see useRoster's State.offline. */
  offline: boolean;
  pendingCount: number;
}

/**
 * Always-visible header at the door. The connection state matters more
 * here than anywhere else in the admin panel: a volunteer needs to know
 * their taps are safe even when the venue wifi drops.
 */
export function SyncStatusBar({ present, total, offline, pendingCount }: Props) {
  let tone: string;
  let label: string;

  if (offline && pendingCount > 0) {
    tone =
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
    label = `Sin conexión — ${pendingCount} cambio${
      pendingCount === 1 ? "" : "s"
    } en cola. Se guardarán solos.`;
  } else if (offline) {
    tone =
      "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400";
    label = "Sin conexión — mostrando datos en caché.";
  } else {
    tone =
      "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300";
    label = "Sincronizado";
  }

  return (
    <div
      className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2 text-sm ${tone}`}
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">
        {present}/{total} presentes
      </span>
    </div>
  );
}

import type { Attendee } from "./types";

interface Props {
  attendee: Attendee;
  /** Attendees whose lastImportId is older than the newest import. */
  stale: boolean;
  onToggle: (a: Attendee) => void;
}

const time = (d: Date | null) =>
  d
    ? d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : "";

export function AttendeeRow({ attendee, stale, onToggle }: Props) {
  const { checkedIn, pending } = attendee;

  return (
    <li
      className={`flex items-center gap-3 border-l-4 px-4 py-3 ${
        pending
          ? "border-l-amber-400"
          : checkedIn
            ? "border-l-green-500"
            : "border-l-transparent"
      } ${checkedIn ? "bg-green-50/60 dark:bg-green-900/10" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900 dark:text-white">
          {attendee.firstName} {attendee.lastName}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {attendee.email}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {attendee.ticketTitle && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {attendee.ticketTitle}
            </span>
          )}
          {stale && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
              ya no está en el CSV
            </span>
          )}
          {attendee.bevyCheckinAt && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              ya marcado en Bevy
            </span>
          )}
          {checkedIn && attendee.checkedInAt && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {time(attendee.checkedInAt)}
              {attendee.checkedInByName ? ` · ${attendee.checkedInByName}` : ""}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onToggle(attendee)}
        aria-pressed={checkedIn}
        // Large tap target: this is used one-handed on a phone at the door.
        className={`min-w-[104px] shrink-0 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
          checkedIn
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {checkedIn ? "✓ Presente" : "Marcar"}
      </button>
    </li>
  );
}

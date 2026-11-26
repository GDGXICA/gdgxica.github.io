import type { CertificateSettings } from "@/lib/api";
import { FormField } from "../ui/FormField";
import { inputClass } from "../ui/atlas";
import { hoursBetween } from "./format";

/** The form's view of CertificateSettings: everything as typed. */
export interface SettingsDraft {
  eventName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  hours: string;
}

export const EMPTY_DRAFT: SettingsDraft = {
  eventName: "",
  eventDate: "",
  startTime: "",
  endTime: "",
  hours: "",
};

export function toDraft(settings: CertificateSettings | null): SettingsDraft {
  if (!settings) return { ...EMPTY_DRAFT };
  return {
    eventName: settings.eventName,
    eventDate: settings.eventDate,
    startTime: settings.startTime,
    endTime: settings.endTime,
    hours: settings.hours > 0 ? String(settings.hours) : "",
  };
}

export type DraftErrors = Partial<Record<keyof SettingsDraft, string>>;

/**
 * What is wrong with the draft. Hours are only required when the
 * certificate credits them, which speakers' do not.
 */
export function draftErrors(
  draft: SettingsDraft,
  needsHours: boolean
): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.eventName.trim())
    errors.eventName = "Escribe el nombre del evento.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate))
    errors.eventDate = "Elige la fecha.";
  if (!/^\d{2}:\d{2}$/.test(draft.startTime))
    errors.startTime = "Indica la hora de inicio.";
  if (!/^\d{2}:\d{2}$/.test(draft.endTime))
    errors.endTime = "Indica la hora de fin.";
  const hours = Number(draft.hours);
  if (draft.hours.trim() && !(hours > 0 && hours <= 500))
    errors.hours = "Usa un número mayor que 0.";
  else if (needsHours && !draft.hours.trim())
    errors.hours = "Indica cuántas horas acredita.";
  return errors;
}

export function fromDraft(draft: SettingsDraft): CertificateSettings {
  return {
    eventName: draft.eventName.trim(),
    eventDate: draft.eventDate,
    startTime: draft.startTime,
    endTime: draft.endTime,
    hours: Number(draft.hours) > 0 ? Number(draft.hours) : 0,
  };
}

export function sameDraft(a: SettingsDraft, b: SettingsDraft): boolean {
  return (Object.keys(a) as (keyof SettingsDraft)[]).every(
    (k) => a[k].trim() === b[k].trim()
  );
}

interface Props {
  draft: SettingsDraft;
  onChange: (draft: SettingsDraft) => void;
  /** Shown only after a save or send was attempted. */
  errors?: DraftErrors;
  idPrefix: string;
}

/**
 * Name, date, schedule and hours of the event as the certificate prints
 * them. Changing the schedule updates the hours while they still match
 * the old schedule; once someone types other hours, they stay.
 */
export function SettingsFields({
  draft,
  onChange,
  errors = {},
  idPrefix,
}: Props) {
  const set = (patch: Partial<SettingsDraft>) => {
    const next = { ...draft, ...patch };
    if ("startTime" in patch || "endTime" in patch) {
      const before = hoursBetween(draft.startTime, draft.endTime);
      const after = hoursBetween(next.startTime, next.endTime);
      const followed = !draft.hours.trim() || Number(draft.hours) === before;
      if (followed && after > 0) next.hours = String(after);
    }
    onChange(next);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="Nombre del evento" required error={errors.eventName}>
          <input
            id={`${idPrefix}-name`}
            className={inputClass}
            value={draft.eventName}
            maxLength={300}
            onChange={(e) => set({ eventName: e.target.value })}
            placeholder="DevFest Ica 2026"
          />
        </FormField>
      </div>
      <FormField label="Fecha" required error={errors.eventDate}>
        <input
          id={`${idPrefix}-date`}
          type="date"
          className={inputClass}
          value={draft.eventDate}
          onChange={(e) => set({ eventDate: e.target.value })}
        />
      </FormField>
      <FormField label="Horas que acredita" error={errors.hours}>
        <input
          id={`${idPrefix}-hours`}
          type="number"
          min="0"
          step="0.25"
          inputMode="decimal"
          className={inputClass}
          value={draft.hours}
          onChange={(e) => set({ hours: e.target.value })}
          placeholder="9"
        />
      </FormField>
      <FormField label="Hora de inicio" required error={errors.startTime}>
        <input
          id={`${idPrefix}-start`}
          type="time"
          className={inputClass}
          value={draft.startTime}
          onChange={(e) => set({ startTime: e.target.value })}
        />
      </FormField>
      <FormField label="Hora de fin" required error={errors.endTime}>
        <input
          id={`${idPrefix}-end`}
          type="time"
          className={inputClass}
          value={draft.endTime}
          onChange={(e) => set({ endTime: e.target.value })}
        />
      </FormField>
    </div>
  );
}

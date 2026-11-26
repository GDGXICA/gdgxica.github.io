import type {
  CertificateKind,
  CertificateStatus,
  CheckinSource,
} from "@/lib/api";

export const CERT_KINDS: {
  value: CertificateKind;
  /** Tab and list name. */
  label: string;
  /** "Certificado …" */
  what: string;
  description: string;
}[] = [
  {
    value: "attendee",
    label: "Asistentes",
    what: "de participación",
    description: "Para quienes participaron del evento e hicieron check-in.",
  },
  {
    value: "volunteer",
    label: "Voluntariado",
    what: "de voluntariado",
    description: "Para el equipo que hizo posible el evento.",
  },
  {
    value: "speaker",
    label: "Speakers",
    what: "de reconocimiento a speaker",
    description: "Para quienes dieron una charla o un taller.",
  },
];

export const kindInfo = (kind: CertificateKind) =>
  CERT_KINDS.find((k) => k.value === kind) ?? CERT_KINDS[0];

export const STATUS: Record<
  CertificateStatus,
  { label: string; tone: string }
> = {
  pending: { label: "Sin enviar", tone: "border-atlas-line text-atlas-mist" },
  queued: { label: "En cola", tone: "border-atlas-glow/50 text-atlas-glow" },
  sending: {
    label: "Enviando",
    tone: "border-atlas-glow/50 text-atlas-glow",
  },
  sent: { label: "Enviado", tone: "border-atlas-ok/50 text-atlas-ok" },
  failed: { label: "Falló", tone: "border-atlas-rose/50 text-atlas-rose" },
  cancelled: {
    label: "Cancelado",
    tone: "border-atlas-line text-atlas-fog",
  },
  excluded: { label: "Excluido", tone: "border-atlas-line text-atlas-fog" },
};

export const CHECKIN: Record<CheckinSource, string> = {
  panel: "Check-in",
  bevy: "Check-in en Bevy",
  both: "Check-in y Bevy",
};

const SKIP_REASON: Record<string, string> = {
  no_checkin: "sin check-in",
  already_sent: "ya lo recibió",
  already_queued: "ya estaba en cola",
  excluded: "excluido",
  duplicate: "repetido",
  not_found: "ya no existe",
};

/** "2 ya lo recibieron, 1 sin check-in" */
export function describeSkipped(skipped: { reason: string }[]): string {
  const counts = new Map<string, number>();
  for (const s of skipped)
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return [...counts]
    .map(([reason, n]) => `${n} ${SKIP_REASON[reason] ?? reason}`)
    .join(", ");
}

const MISSING: Record<string, string> = {
  eventName: "el nombre del evento",
  eventDate: "la fecha",
  startTime: "la hora de inicio",
  endTime: "la hora de fin",
  hours: "las horas",
};

export function describeMissing(missing: string[]): string {
  return missing.map((m) => MISSING[m] ?? m).join(", ");
}

export const people = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;
export const certificates = (n: number) =>
  `${n} ${n === 1 ? "certificado" : "certificados"}`;

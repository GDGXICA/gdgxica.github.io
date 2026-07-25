export type BevyStatus = "pending" | "loaded" | "not_found" | "discarded";
export type PhotoStatus = "none" | "pending_review" | "approved" | "removed";
export type EmailStatus = "queued" | "sending" | "sent" | "failed";

/**
 * A credential as the panel sees it.
 *
 * Mirrors the document written by functions/src/handlers/credentials.ts.
 * Timestamps arrive as Firestore Timestamps and are converted to Date by
 * useCredentials so the components never deal with two time types.
 */
export interface Credential {
  id: string;
  dni: string;
  dniNormalized: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  githubUsername: string | null;

  heardAbout: string;
  heardAboutOther: string;
  yearsExperience: string;
  googleToolsLevel: string;

  sequenceNumber: number;
  groupLetter: string;
  avatarKind: "photo" | "mascot";
  mascotId: string | null;

  photoStatus: PhotoStatus;
  photoPath: string | null;
  credentialImagePath: string | null;
  photoUploadedAt: Date | null;

  emailStatus: EmailStatus;
  emailAttempts: number;
  emailLastError: string | null;
  emailSentAt: Date | null;

  bevyStatus: BevyStatus;
  bevyTicketNumber: string | null;
  bevyNote: string | null;
  bevyLoadedAt: Date | null;

  createdAt: Date | null;
}

export const BEVY_STATUS_LABEL: Record<BevyStatus, string> = {
  pending: "Pendiente",
  loaded: "Cargado",
  not_found: "No encontrado",
  discarded: "Descartado",
};

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  queued: "En cola",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falló",
};

/**
 * Groups credentials sharing a normalized DNI.
 *
 * Duplicates are never blocked on write — that would let anyone lock a real
 * person out of registering by claiming their number first — so surfacing
 * them here is the entire mitigation. Computed client-side from the list
 * the panel already holds rather than stored, which keeps it correct
 * without adding a query inside the creation transaction.
 */
export function findDniConflicts(credentials: Credential[]): Set<string> {
  const byDni = new Map<string, number>();
  for (const c of credentials) {
    byDni.set(c.dniNormalized, (byDni.get(c.dniNormalized) ?? 0) + 1);
  }
  const conflicting = new Set<string>();
  for (const c of credentials) {
    if ((byDni.get(c.dniNormalized) ?? 0) > 1) conflicting.add(c.id);
  }
  return conflicting;
}

export type AttendeeSource = "bevy" | "manual";

export const HEARD_ABOUT_OPTIONS = [
  "Redes sociales",
  "Me notificó la comunidad",
  "Meetup.com",
  "Me lo recomendó un amigo o colega",
  "Otro",
] as const;

export interface Attendee {
  /** Firestore document ID: `t_${ticketNumber}` or `m_${randomId}`. */
  id: string;
  source?: AttendeeSource;
  ticketNumber: string;
  orderNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  ticketTitle: string;
  searchTokens: string[];
  /** When Bevy itself has them checked in. Null for almost everyone. */
  bevyCheckinAt: Date | null;
  lastImportId: string;

  checkedIn: boolean;
  checkedInAt: Date | null;
  checkedInBy: string | null;
  checkedInByName: string | null;
  note: string | null;

  dniVerified: boolean;

  /**
   * Stamped by the reconciliation, not by the Bevy import — Bevy has no
   * DNI field. Null until reconciliation matches this row to a credential,
   * which is most of them right up until the roster is imported.
   */
  dni: string | null;

  heardAbout?: string | null;

  /** True while this row's write is still queued in the local cache. */
  pending: boolean;
}

export interface CheckinMeta {
  lastImportId: string | null;
  lastImportAt: Date | null;
  lastImportByName: string | null;
  rosterCount: number;
}

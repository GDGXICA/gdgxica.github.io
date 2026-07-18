export interface Attendee {
  /** Firestore document ID: `t_${ticketNumber}`. */
  id: string;
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

  /** True while this row's write is still queued in the local cache. */
  pending: boolean;
}

export interface CheckinMeta {
  lastImportId: string | null;
  lastImportAt: Date | null;
  lastImportByName: string | null;
  rosterCount: number;
}

export interface FirestoreTime {
  seconds: number;
  nanoseconds?: number;
}

export type MuralPhotoStatus = "pending" | "approved" | "rejected" | "removed";

export interface MuralPhoto {
  id: string;
  eventSlug: string;
  status: MuralPhotoStatus;
  uid: string;
  alias: string;

  storagePath: string | null;
  downloadUrl: string | null;
  width: number;
  height: number;
  bytes: number;
  createdAt: FirestoreTime | null;
  approvedAt: FirestoreTime | null;
  reviewedAt: FirestoreTime | null;
  reviewedBy: string | null;
  reviewNote: string;

  removalRequestedAt: FirestoreTime | null;
  removalRequestNote: string;
  removedReason: "owner_request" | "moderation" | "other" | null;
}

export type MuralState = "closed" | "open" | "paused";

export interface MuralSettings {
  state: MuralState;
  maxPerUid: number;
  maxTotal: number;
  acceptedTotal: number;
  headline: string;
}

export const DEFAULT_MURAL_SETTINGS: MuralSettings = {
  state: "closed",
  maxPerUid: 10,
  maxTotal: 1500,
  acceptedTotal: 0,
  headline: "",
};

export function readMuralSettings(
  data: Record<string, unknown> | undefined | null
): MuralSettings {
  const state = data?.state;
  return {
    state: state === "open" ? "open" : state === "paused" ? "paused" : "closed",
    maxPerUid:
      typeof data?.maxPerUid === "number"
        ? data.maxPerUid
        : DEFAULT_MURAL_SETTINGS.maxPerUid,
    maxTotal:
      typeof data?.maxTotal === "number"
        ? data.maxTotal
        : DEFAULT_MURAL_SETTINGS.maxTotal,
    acceptedTotal:
      typeof data?.acceptedTotal === "number" ? data.acceptedTotal : 0,
    headline: typeof data?.headline === "string" ? data.headline : "",
  };
}

export function remainingQuota(
  mine: readonly MuralPhoto[],
  maxPerUid: number
): number {
  return Math.max(0, maxPerUid - mine.length);
}

export const MURAL_STATUS_LABELS: Record<MuralPhotoStatus, string> = {
  pending: "En revisión",
  approved: "En el mural",
  rejected: "No publicada",
  removed: "Retirada",
};

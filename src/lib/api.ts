import { getIdToken } from "./auth";
import { getAppCheckToken } from "./firebase";
import { mockApi } from "./mock-api";

const USE_EMULATOR = import.meta.env.PUBLIC_USE_FIREBASE_EMULATOR === "true";
const API_BASE = "/api";

export const isDevPreview =
  !USE_EMULATOR &&
  typeof window !== "undefined" &&
  window.location.hostname === "localhost";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Body of a public credential submission.
 *
 * Mirrors credentialCreateSchema in functions/src/schemas/credentials.ts.
 * The consent flags are typed `true` rather than `boolean` because the
 * server schema uses z.literal(true) — an unchecked box has to fail at the
 * call site, not round-trip as a stored `false`.
 */
export interface CredentialCreatePayload {
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  company: string;
  githubUsername: string | null;
  heardAbout:
    "redes_sociales" | "amigo_colega" | "universidad" | "meetup" | "otro";
  heardAboutOther: string;
  yearsExperience: "menos_1" | "1_2" | "3_5" | "6_10" | "mas_10";
  googleToolsLevel: "ninguna" | "basica" | "intermedia" | "avanzada";
  consentGdgTerms: true;
  consentGooglePrivacy: true;
  consentCodeOfConduct: true;
  consentDataProcessing: true;
  consentAgeAttested: true;
  consentPolicyVersion: string;
  avatarKind: "photo" | "mascot";
  mascotId: string | null;
  photoDataUrl: string | null;
  credentialImageDataUrl: string | null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const token = await getIdToken();
  if (!token) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Proves the call came from this web app rather than a script that
    // minted an anonymous token elsewhere. Omitted when unavailable; the
    // server decides what that means.
    const appCheckToken = await getAppCheckToken();

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const fallback =
        res.status === 401 || res.status === 403
          ? "Sesión expirada o sin permisos. Vuelve a iniciar sesión."
          : `Error ${res.status}`;
      // El cuerpo puede no ser JSON (p. ej. una página de error HTML).
      const data = await res.json().catch(() => null);
      return {
        success: false,
        error: data?.error || data?.message || fallback,
      };
    }

    return (await res.json()) as ApiResponse<T>;
  } catch {
    return { success: false, error: "No se pudo conectar con el servidor." };
  }
}

const realApi = {
  // Auth
  register: () => request("POST", "/auth/register"),

  // Events
  listEvents: () => request("GET", "/events"),
  getEvent: (id: string) => request("GET", `/events/${id}`),
  createEvent: (data: unknown) => request("POST", "/events", data),
  updateEvent: (id: string, data: unknown) =>
    request("PUT", `/events/${id}`, data),
  deleteEvent: (id: string) => request("DELETE", `/events/${id}`),

  // Team
  listTeam: () => request("GET", "/team"),
  addTeamMember: (data: unknown) => request("POST", "/team", data),
  updateTeamMember: (id: string, data: unknown) =>
    request("PUT", `/team/${id}`, data),
  deleteTeamMember: (id: string) => request("DELETE", `/team/${id}`),

  // Speakers
  listSpeakers: () => request("GET", "/speakers"),
  addSpeaker: (data: unknown) => request("POST", "/speakers", data),
  updateSpeaker: (id: string, data: unknown) =>
    request("PUT", `/speakers/${id}`, data),
  deleteSpeaker: (id: string) => request("DELETE", `/speakers/${id}`),

  // Sponsors
  listSponsors: () => request("GET", "/sponsors"),
  addSponsor: (data: unknown) => request("POST", "/sponsors", data),
  updateSponsor: (id: string, data: unknown) =>
    request("PUT", `/sponsors/${encodeURIComponent(id)}`, data),
  deleteSponsor: (id: string) =>
    request("DELETE", `/sponsors/${encodeURIComponent(id)}`),

  // Stats
  getStats: () => request("GET", "/stats"),
  updateStats: (data: unknown) => request("PUT", "/stats", data),

  // Users
  listUsers: () => request("GET", "/users"),
  updateUserRole: (uid: string, role: string, reason: string) =>
    request("PATCH", `/users/${uid}/role`, { role, reason }),
  updateUserStatus: (uid: string, status: string, reason: string) =>
    request("PATCH", `/users/${uid}/status`, { status, reason }),
  updateUserGrants: (
    uid: string,
    grants: unknown[],
    revocations: string[],
    reason: string
  ) => request("PUT", `/users/${uid}/grants`, { grants, revocations, reason }),

  // Audit
  listAudit: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/audit${qs ? `?${qs}` : ""}`);
  },

  // Propuestas de contenido
  listProposals: () => request("GET", "/proposals"),
  createProposal: (type: string, payload: unknown) =>
    request("POST", "/proposals", { type, payload }),
  updateProposal: (id: string, payload: unknown) =>
    request("PUT", `/proposals/${id}`, { payload }),
  reviewProposal: (id: string, decision: string, note?: string) =>
    request("POST", `/proposals/${id}/review`, { decision, note }),
  publishProposal: (id: string) => request("POST", `/proposals/${id}/publish`),

  // Equipo por evento
  listEventStaff: (slug: string) => request("GET", `/events/${slug}/staff`),
  assignEventStaff: (slug: string, uid: string, data: unknown) =>
    request("PUT", `/events/${slug}/staff/${uid}`, data),
  removeEventStaff: (slug: string, uid: string) =>
    request("DELETE", `/events/${slug}/staff/${uid}`),
  listMyEvents: () => request("GET", "/me/events"),

  // Access — solicitudes e invitaciones
  getMyAccessRequest: () => request("GET", "/access/requests/me"),
  createAccessRequest: (data: unknown) =>
    request("POST", "/access/requests", data),
  listAccessRequests: (status = "pending") =>
    request("GET", `/access/requests?status=${encodeURIComponent(status)}`),
  decideAccessRequest: (
    uid: string,
    approve: boolean,
    note: string,
    role?: string
  ) =>
    request("POST", `/access/requests/${uid}/decide`, { approve, note, role }),
  listInvitations: () => request("GET", "/access/invitations"),
  createInvitation: (email: string, role: string) =>
    request("POST", "/access/invitations", { email, role }),
  revokeInvitation: (id: string) =>
    request("DELETE", `/access/invitations/${id}`),
  redeemInvitation: (token: string) =>
    request("POST", "/access/invitations/redeem", { token }),

  // Forms
  listForms: () => request("GET", "/forms"),
  addForm: (data: unknown) => request("POST", "/forms", data),
  updateForm: (id: string, data: unknown) =>
    request("PUT", `/forms/${id}`, data),
  deleteForm: (id: string) => request("DELETE", `/forms/${id}`),
  getFormResponses: (id: string) => request("GET", `/forms/${id}/responses`),

  // Locations
  listLocations: () => request("GET", "/locations"),
  addLocation: (data: unknown) => request("POST", "/locations", data),
  updateLocation: (id: string, data: unknown) =>
    request("PUT", `/locations/${id}`, data),
  deleteLocation: (id: string) => request("DELETE", `/locations/${id}`),

  // Minigame Templates (admin-only on the server)
  listMinigameTemplates: () => request("GET", "/minigame-templates"),
  addMinigameTemplate: (data: unknown) =>
    request("POST", "/minigame-templates", data),
  updateMinigameTemplate: (id: string, data: unknown) =>
    request("PUT", `/minigame-templates/${id}`, data),
  deleteMinigameTemplate: (id: string) =>
    request("DELETE", `/minigame-templates/${id}`),

  // Minigame Instances (per event, admin-only)
  listEventMinigames: (slug: string) =>
    request("GET", `/events/${encodeURIComponent(slug)}/minigames`),
  attachMinigameToEvent: (slug: string, data: unknown) =>
    request("POST", `/events/${encodeURIComponent(slug)}/minigames`, data),
  setMinigameState: (slug: string, id: string, state: string) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/state`,
      { state }
    ),
  advanceQuizQuestion: (slug: string, id: string) =>
    request(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/quiz/advance`
    ),
  removeMinigameFromEvent: (slug: string, id: string) =>
    request("DELETE", `/events/${encodeURIComponent(slug)}/minigames/${id}`),

  // Public participant join (anon-friendly)
  joinEventMinigames: (slug: string, data: { alias: string }) =>
    request<{
      alias: string;
      instances: {
        id: string;
        type: string;
        joined: boolean;
        bingoCard?: string[];
      }[];
    }>("POST", `/events/${encodeURIComponent(slug)}/minigames/join`, data),

  // Public credential submission (anon-friendly).
  //
  // Callers MUST await signInAnonymouslyIfNeeded() first: request() hard
  // -returns { success: false, error: "Not authenticated" } with no token,
  // which would surface as an English error string in a Spanish form.
  createCredential: (slug: string, data: CredentialCreatePayload) =>
    request<{
      credentialId: string;
      sequenceNumber: number;
      groupLetter: string;
    }>("POST", `/events/${encodeURIComponent(slug)}/credentials`, data),

  // Attaches the composed card after creation. A separate call because the
  // group letter comes from a server-assigned sequence number, so the
  // final card cannot exist until createCredential has returned.
  attachCredentialImage: (
    slug: string,
    id: string,
    data: { credentialImageDataUrl: string }
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/credentials/${id}/image`,
      data
    ),

  // Credential administration (organizer-level).
  setCredentialBevyStatus: (
    slug: string,
    id: string,
    data: {
      status: "pending" | "loaded" | "not_found" | "discarded";
      ticketNumber: string | null;
      note: string | null;
    }
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/credentials/${id}/bevy`,
      data
    ),
  moderateCredentialPhoto: (
    slug: string,
    id: string,
    data: { action: "approve" | "remove"; reason: string }
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/credentials/${id}/photo`,
      data
    ),
  getEmailSettings: () =>
    request<{
      transport: "gmail" | "resend";
      dailyCap: number;
      resendConfigured: boolean;
    }>("GET", "/settings/email"),
  setEmailTransport: (transport: "gmail" | "resend") =>
    request<{ transport: "gmail" | "resend"; dailyCap: number }>(
      "PUT",
      "/settings/email",
      { transport }
    ),
  reconcileCredentials: (slug: string) =>
    request<{
      matched: number;
      unmatchedCredentials: number;
      unmatchedRoster: number;
      ambiguous: number;
    }>("POST", `/events/${encodeURIComponent(slug)}/credentials/reconcile`),
  sendCredentialReminders: (slug: string, credentialIds: string[]) =>
    request<{ queued: number; skipped: number }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/credentials/reminders`,
      { credentialIds }
    ),
  retryCredentialEmail: (slug: string, id: string) =>
    request(
      "POST",
      `/events/${encodeURIComponent(slug)}/credentials/${id}/email/retry`
    ),

  // Wordcloud moderation + bingo winners (admin-only)
  listEventMinigameWords: (slug: string, id: string) =>
    request("GET", `/events/${encodeURIComponent(slug)}/minigames/${id}/words`),
  setMinigameWordHidden: (
    slug: string,
    id: string,
    wordId: string,
    hidden: boolean
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/words/${encodeURIComponent(
        wordId
      )}/hidden`,
      { hidden }
    ),
  listMinigameBingoWinners: (slug: string, id: string) =>
    request(
      "GET",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/winners`
    ),

  // Roulette spin (admin-only)
  spinRoulette: (slug: string, id: string) =>
    request<{ winnerId: string; alias: string; spinNumber: number }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/roulette/spin`
    ),

  // Classic bingo: the admin calls a ball (admin-only)...
  drawBingoBall: (slug: string, id: string) =>
    request<{ term: string; drawCount: number; remaining: number }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/bingo/draw`
    ),
  // ...and the participant claims the line. Verified server-side against
  // the balls actually called, so nothing here is taken on trust.
  claimBingo: (slug: string, id: string) =>
    request<{
      rank: number;
      winDraw: number;
      prizes: number;
      hasPrize: boolean;
      lines: number[][];
      alreadyWon: boolean;
    }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/bingo/claim`
    ),

  // Certificates (generated on the fly + emailed; nothing is stored)
  sendCertificates: (data: unknown) =>
    request<{
      sent: number;
      failed: number;
      results: { email: string; name: string; ok: boolean; error?: string }[];
    }>("POST", "/certificates/send", data),

  // On-site check-in. Only the roster import goes through the API —
  // volunteers toggle check-in directly against Firestore so the write
  // survives a venue wifi drop.
  importCheckinRoster: (slug: string, rows: unknown[]) =>
    request<{
      importId: string;
      total: number;
      created: number;
      updated: number;
      stale: number;
      unusableTickets: number;
    }>("POST", `/events/${encodeURIComponent(slug)}/checkin/import`, { rows }),

  // Rebuild
  triggerRebuild: () => request("POST", "/rebuild"),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api: typeof realApi = isDevPreview ? (mockApi as any) : realApi;

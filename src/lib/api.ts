import { getIdToken } from "./auth";
import { getAppCheckToken } from "./firebase";
import {
  clearStoredGuestSession,
  ensureMinigameSession,
  getGuestSessionToken,
} from "./guestSession";
import { mockApi } from "./mock-api";
import { recordServerClockSample } from "./serverClock";

const USE_EMULATOR = import.meta.env.PUBLIC_USE_FIREBASE_EMULATOR === "true";
const API_BASE = "/api";

export const isDevPreview =
  !USE_EMULATOR &&
  typeof window !== "undefined" &&
  window.location.hostname === "localhost";

interface ApiResponse<T> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
  message?: string;

  code?: string;
  /**
   * Validation problems from `validateBody`, with paths like
   * `recipients.3.email`, so a form can point at the row instead of
   * showing "Invalid request body".
   */
  issues?: { path: string; message: string }[];
  /** Certificate fields still missing before a send (see eventCertificates). */
  missing?: string[];
}

interface RequestOptions {
  timeoutMs?: number;
  appCheck?: boolean;
  participantAuth?: boolean;
  retries?: number;
  retryDelayMs?: number;
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
  /** Stable across retries of one submit attempt. */
  submissionId: string;
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

/**
 * Un post del foro, tal como lo guarda el repo de datos.
 *
 * Espeja `postSchema` en functions/src/schemas/index.ts. `updated_at` lo pone
 * el servidor pero viaja de vuelta al guardar, porque el editor devuelve el
 * post entero tal como lo cargó.
 */
export interface Post {
  id: string;
  title: string;
  excerpt: string;
  cover_image_url: string;
  tags: string[];
  author_name: string;
  author_photo_url: string;
  published_at: string;
  status: "draft" | "published";
  body: string;
  updated_at?: string;
}

/** Lo que devuelve el índice: un post sin su cuerpo. */
export type PostSummary = Omit<Post, "body">;

// Certificates — mirrors functions/src/handlers/eventCertificates.ts.

export type CertificateKind = "attendee" | "volunteer" | "speaker";

export type CertificateStatus =
  | "pending"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled"
  | "excluded";

export type CheckinSource = "panel" | "bevy" | "both";

/** Event data printed on a certificate. Times are 24-hour "HH:mm". */
export interface CertificateSettings {
  eventName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  hours: number;
}

export interface CertificateItem {
  id: string;
  kind: CertificateKind;
  source: "roster" | "registered" | "manual";
  rosterId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  hours: number | null;
  status: CertificateStatus;
  attempts: number;
  lastError: string | null;
  sentAt: number | null;
  queuedAt: number | null;
  updatedAt: number | null;
  resendCount: number;
  overridden: boolean;
  eventRef: string | null;
  content: CertificateSettings | null;
  /** Attendees only: how their attendance is proven, if it still is. */
  checkin?: CheckinSource | null;
}

export interface EventCertificates {
  serverTime: number;
  settings: CertificateSettings | null;
  settingsSaved: boolean;
  attendees: CertificateItem[];
  people: CertificateItem[];
  roster: {
    total: number | null;
    lastImportAt: number | null;
    checkedIn: number;
  };
  budget: { sentToday: number; cap: number; transport: "gmail" | "resend" };
}

export interface CertificatePersonInput {
  firstName: string;
  lastName: string;
  email: string;
  hours?: number | null;
}

export interface CertificatePersonPatch {
  rosterId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  hours?: number | null;
  excluded?: boolean;
}

export interface ManualCertificatesInput {
  submissionId: string;
  kind: CertificateKind;
  eventSlug: string | null;
  content: CertificateSettings;
  recipients: { firstName: string; lastName: string; email: string }[];
}

function resolveOptions(
  optionsOrTimeout?: number | RequestOptions
): RequestOptions {
  if (typeof optionsOrTimeout === "number") {
    return { timeoutMs: optionsOrTimeout };
  }
  return optionsOrTimeout ?? {};
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 502 || status === 503 || status === 504;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractEventSlugFromPath(path: string): string | null {
  const match = /^\/events\/([^/]+)\//.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

async function singleRequest<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions
): Promise<{
  response: ApiResponse<T>;
  retryable: boolean;
  usedGuestToken?: boolean;
}> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<{
    response: ApiResponse<T>;
    retryable: boolean;
    usedGuestToken?: boolean;
  }>((resolve) => {
    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({
          response: {
            success: false,
            error:
              "El servidor tardó demasiado en responder. Inténtalo de nuevo.",
          },
          retryable: true,
        });
      }, options.timeoutMs);
    }
  });

  const operation = (async (): Promise<{
    response: ApiResponse<T>;
    retryable: boolean;
    usedGuestToken?: boolean;
  }> => {
    try {
      const guestToken = options.participantAuth
        ? getGuestSessionToken()
        : null;
      const token = guestToken ?? (await getIdToken());
      if (!token) {
        return {
          response: { success: false, error: "Not authenticated" },
          retryable: false,
        };
      }

      const appCheckToken = options.appCheck ? await getAppCheckToken() : null;

      const requestStartedAt = Date.now();
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const endedAt = Date.now();
      const serverTimeHeader = res.headers?.get("X-Server-Time-Ms");
      if (serverTimeHeader) {
        const parsedServerMs = Number(serverTimeHeader);
        if (Number.isFinite(parsedServerMs)) {
          recordServerClockSample(
            parsedServerMs,
            Math.round((requestStartedAt + endedAt) / 2),
            endedAt - requestStartedAt
          );
        }
      }

      if (!res.ok) {
        const fallback =
          res.status === 401 || res.status === 403
            ? "Sesión expirada o sin permisos. Vuelve a iniciar sesión."
            : `Error ${res.status}`;
        const data = await res.json().catch(() => null);
        return {
          response: {
            success: false,
            status: res.status,
            error: data?.error || data?.message || fallback,
            ...(typeof data?.code === "string" ? { code: data.code } : {}),
            ...(Array.isArray(data?.issues) ? { issues: data.issues } : {}),
            ...(Array.isArray(data?.missing) ? { missing: data.missing } : {}),
          },
          retryable: isRetryableStatus(res.status),
          usedGuestToken: Boolean(guestToken),
        };
      }

      return {
        response: (await res.json()) as ApiResponse<T>,
        retryable: false,
        usedGuestToken: Boolean(guestToken),
      };
    } catch (err) {
      return {
        response: {
          success: false,
          error:
            err instanceof DOMException && err.name === "AbortError"
              ? "El servidor tardó demasiado en responder. Inténtalo de nuevo."
              : "No se pudo conectar con el servidor.",
        },
        retryable: true,
      };
    }
  })();

  try {
    return await Promise.race([operation, timedOut]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  optionsOrTimeout?: number | RequestOptions
): Promise<ApiResponse<T>> {
  const options = resolveOptions(optionsOrTimeout);
  const maxRetries = options.retries ?? 0;
  const baseDelay = options.retryDelayMs ?? 300;

  let lastResult: ApiResponse<T> = {
    success: false,
    error: "No se pudo conectar con el servidor.",
  };
  let refreshedGuestSession = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { response, retryable, usedGuestToken } = await singleRequest<T>(
      method,
      path,
      body,
      options
    );
    lastResult = response;
    if (
      !response.success &&
      response.status === 401 &&
      usedGuestToken &&
      !refreshedGuestSession
    ) {
      refreshedGuestSession = true;
      clearStoredGuestSession();
      const slug = extractEventSlugFromPath(path);
      if (slug) {
        const renewed = await ensureMinigameSession(slug);
        if (renewed) {
          attempt -= 1;
          continue;
        }
      }
    }
    if (response.success || !retryable || attempt === maxRetries) {
      return response;
    }
    const jitter = Math.floor(Math.random() * 150);
    await wait(baseDelay * 2 ** attempt + jitter);
  }

  return lastResult;
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

  // Posts del foro. `listPosts` devuelve el índice (sin cuerpos) y `getPost`
  // el post entero: el listado del panel no necesita el markdown de cada uno.
  listPosts: () => request<PostSummary[]>("GET", "/posts"),
  getPost: (id: string) => request<Post>("GET", `/posts/${id}`),
  createPost: (data: unknown) => request("POST", "/posts", data),
  updatePost: (id: string, data: unknown) =>
    request("PUT", `/posts/${id}`, data),
  deletePost: (id: string) => request("DELETE", `/posts/${id}`),
  // Devuelve la URL pública ya lista para pegar en el markdown.
  uploadPostImage: (dataUrl: string) =>
    request<{ path: string; url: string }>("POST", "/posts/images", {
      dataUrl,
    }),

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
  listMyEvents: () =>
    request<
      {
        eventSlug: string;
        role: string | null;
        expiresAt?: unknown;
        permissions: string[] | null;
      }[]
    >("GET", "/me/events"),

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
      { state },
      { timeoutMs: 25_000 }
    ),
  advanceQuizQuestion: (slug: string, id: string) =>
    request<{
      id: string;
      currentQuestionIndex: number;
      currentQuestionStartedAt?: { seconds: number; nanoseconds: number };
    }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/quiz/advance`,
      undefined,
      { timeoutMs: 25_000 }
    ),
  advancePollQuestion: (slug: string, id: string) =>
    request<{ id: string; currentQuestionIndex: number }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/poll/advance`,
      undefined,
      { timeoutMs: 25_000 }
    ),
  answerQuizQuestion: (
    slug: string,
    id: string,
    questionId: string,
    optionId: string
  ) =>
    request(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/quiz/answer`,
      { questionId, optionId },
      {
        timeoutMs: 10_000,
        retries: 2,
        retryDelayMs: 350,
        participantAuth: true,
      }
    ),
  answerPollQuestion: (
    slug: string,
    id: string,
    questionId: string,
    optionId: string
  ) =>
    request(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/poll/answer`,
      { questionId, optionId },
      {
        timeoutMs: 10_000,
        retries: 2,
        retryDelayMs: 350,
        participantAuth: true,
      }
    ),
  removeMinigameFromEvent: (slug: string, id: string) =>
    request("DELETE", `/events/${encodeURIComponent(slug)}/minigames/${id}`),

  // Public participant join (guest-session or anon-friendly)
  joinEventMinigames: (
    slug: string,
    data: { alias: string; instanceId?: string }
  ) =>
    request<{
      alias: string;
      instances: {
        id: string;
        type: string;
        joined: boolean;
        bingoCard?: string[];
      }[];
    }>("POST", `/events/${encodeURIComponent(slug)}/minigames/join`, data, {
      timeoutMs: 10_000,
      retries: 2,
      retryDelayMs: 350,
      participantAuth: true,
    }),

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
    }>("POST", `/events/${encodeURIComponent(slug)}/credentials`, data, {
      timeoutMs: 30_000,
      appCheck: true,
    }),

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
      data,
      { timeoutMs: 30_000, appCheck: true }
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
      `/events/${encodeURIComponent(slug)}/minigames/${id}/roulette/spin`,
      undefined,
      { timeoutMs: 25_000 }
    ),

  // Classic bingo: the admin calls a ball (admin-only)...
  drawBingoBall: (slug: string, id: string) =>
    request<{ term: string; drawCount: number; remaining: number }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/minigames/${id}/bingo/draw`,
      undefined,
      { timeoutMs: 12_000 }
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

  // Certificates. Sending is a queue on the server: these calls decide who
  // gets what, and a background drain emails them within seconds.
  getEventCertificates: (slug: string) =>
    request<EventCertificates>(
      "GET",
      `/events/${encodeURIComponent(slug)}/certificates`
    ),
  pollEventCertificates: (slug: string, since: number) =>
    request<{ serverTime: number; changes: CertificateItem[] }>(
      "GET",
      `/events/${encodeURIComponent(slug)}/certificates?since=${since}`
    ),
  getCertificateSettings: (slug: string) =>
    request<{ settings: CertificateSettings | null; settingsSaved: boolean }>(
      "GET",
      `/events/${encodeURIComponent(slug)}/certificates/settings`
    ),
  saveCertificateSettings: (slug: string, settings: CertificateSettings) =>
    request<{ settings: CertificateSettings; settingsSaved: boolean }>(
      "PUT",
      `/events/${encodeURIComponent(slug)}/certificates/settings`,
      settings
    ),
  addCertificatePeople: (
    slug: string,
    kind: "volunteer" | "speaker",
    people: CertificatePersonInput[]
  ) =>
    request<{
      added: CertificateItem[];
      skipped: { email: string; reason: string }[];
    }>("POST", `/events/${encodeURIComponent(slug)}/certificates/people`, {
      kind,
      people,
    }),
  updateCertificatePerson: (
    slug: string,
    id: string,
    patch: CertificatePersonPatch
  ) =>
    request<{ certificate: CertificateItem; previousId: string | null }>(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/certificates/${encodeURIComponent(id)}`,
      patch
    ),
  removeCertificatePerson: (slug: string, id: string) =>
    request<{ id: string }>(
      "DELETE",
      `/events/${encodeURIComponent(slug)}/certificates/${encodeURIComponent(id)}`
    ),
  enqueueCertificates: (
    slug: string,
    body: { kind: CertificateKind; ids: string[]; resend?: boolean }
  ) =>
    request<{ queued: number; skipped: { id: string; reason: string }[] }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/certificates/send`,
      body
    ),
  cancelCertificates: (slug: string, ids: string[]) =>
    request<{ cancelled: number; skipped: { id: string; reason: string }[] }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/certificates/cancel`,
      { ids }
    ),
  previewCertificate: (body: {
    kind: CertificateKind;
    name: string;
    content: CertificateSettings;
    hours?: number | null;
  }) => request<{ pdfBase64: string }>("POST", "/certificates/preview", body),
  listManualCertificates: () =>
    request<{ serverTime: number; items: CertificateItem[] }>(
      "GET",
      "/certificates/manual"
    ),
  createManualCertificates: (body: ManualCertificatesInput) =>
    request<{ queued: number; existing: number; duplicates: number }>(
      "POST",
      "/certificates/manual",
      body
    ),

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
      mergedManual?: number;
    }>("POST", `/events/${encodeURIComponent(slug)}/checkin/import`, { rows }),

  registerManualCheckinAttendee: (
    slug: string,
    body: {
      firstName: string;
      lastName: string;
      email: string;
      ticketTitle: string;
      dni?: string;
      heardAbout?: string;
      checkedIn: boolean;
    }
  ) =>
    request<{
      id: string;
      source: "manual";
      email: string;
      checkedIn: boolean;
      existingId?: string;
    }>("POST", `/events/${encodeURIComponent(slug)}/checkin/manual`, body),

  uploadMuralPhoto: (
    slug: string,
    body: {
      dataUrl: string;
      alias: string;
      width: number;
      height: number;
      consent: true;
      clientRequestId: string;
    }
  ) =>
    request<{ id: string; duplicate?: boolean }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/mural/photos`,
      body,
      { appCheck: true }
    ),

  requestMuralRemoval: (slug: string, id: string, note: string) =>
    request<{ alreadyGone?: boolean; alreadyRequested?: boolean }>(
      "POST",
      `/events/${encodeURIComponent(slug)}/mural/photos/${encodeURIComponent(id)}/removal-request`,
      { note }
    ),

  reviewMuralPhoto: (
    slug: string,
    id: string,
    decision: "approve" | "reject",
    note = ""
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/mural/photos/${encodeURIComponent(id)}/review`,
      { decision, note }
    ),

  takedownMuralPhoto: (
    slug: string,
    id: string,
    reason: "owner_request" | "moderation" | "other",
    note: string
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/mural/photos/${encodeURIComponent(id)}/takedown`,
      { reason, note }
    ),

  setMuralSettings: (
    slug: string,
    settings: {
      state: "closed" | "open" | "paused";
      maxPerUid: number;
      maxTotal: number;
      headline: string;
    }
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/mural/settings`,
      settings
    ),

  blockMuralUploader: (
    slug: string,
    uid: string,
    blocked: boolean,
    note = ""
  ) =>
    request(
      "PATCH",
      `/events/${encodeURIComponent(slug)}/mural/uploaders/${encodeURIComponent(uid)}/block`,
      { blocked, note }
    ),

  // Rebuild
  triggerRebuild: () => request("POST", "/rebuild"),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api: typeof realApi = isDevPreview ? (mockApi as any) : realApi;

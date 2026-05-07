import { getIdToken } from "./auth";
import { mockApi } from "./mock-api";

const API_BASE = "/api";

export const isDevPreview =
  typeof window !== "undefined" && window.location.hostname === "localhost";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json();
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
  updateUserRole: (uid: string, role: string) =>
    request("PATCH", `/users/${uid}/role`, { role }),

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

  // Rebuild
  triggerRebuild: () => request("POST", "/rebuild"),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api: typeof realApi = isDevPreview ? (mockApi as any) : realApi;

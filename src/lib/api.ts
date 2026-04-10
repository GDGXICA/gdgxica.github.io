import { getIdToken } from "./auth";

const API_BASE = "/api";

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

export const api = {
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

  // Users
  listUsers: () => request("GET", "/users"),
  updateUserRole: (uid: string, role: string) =>
    request("PATCH", `/users/${uid}/role`, { role }),

  // Rebuild
  triggerRebuild: () => request("POST", "/rebuild"),
};

import {
  MOCK_SPEAKERS,
  MOCK_EVENTS,
  MOCK_TEAM,
  MOCK_SPONSORS,
  MOCK_STATS,
  MOCK_USERS,
  MOCK_FORMS,
  MOCK_FORM_RESPONSES,
  MOCK_LOCATIONS,
} from "./mock-data";

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data });
}

export const mockApi = {
  register: () => ok({ role: "admin" }),

  listEvents: () => ok(MOCK_EVENTS),
  getEvent: (id: string) =>
    ok(MOCK_EVENTS.find((e) => e.id === id) || MOCK_EVENTS[0]),
  createEvent: () => ok({ id: "new-event" }),
  updateEvent: () => ok({ id: "updated" }),
  deleteEvent: () => ok(null),

  listTeam: () => ok(MOCK_TEAM),
  addTeamMember: () => ok({ id: "new-member" }),
  updateTeamMember: () => ok({ id: "updated" }),
  deleteTeamMember: () => ok(null),

  listSpeakers: () => ok(MOCK_SPEAKERS),
  addSpeaker: () => ok({ id: "new-speaker" }),
  updateSpeaker: () => ok({ id: "updated" }),
  deleteSpeaker: () => ok(null),

  listSponsors: () => ok(MOCK_SPONSORS),
  addSponsor: () => ok({ name: "new" }),
  updateSponsor: () => ok({ name: "updated" }),
  deleteSponsor: () => ok(null),

  getStats: () => ok(MOCK_STATS),
  updateStats: () => ok(MOCK_STATS),

  listUsers: () => ok(MOCK_USERS),
  updateUserRole: () => ok({ uid: "dev", role: "admin" }),

  listForms: () => ok(MOCK_FORMS),
  addForm: () => ok({ id: "new-form" }),
  updateForm: () => ok({ id: "updated" }),
  deleteForm: () => ok(null),
  getFormResponses: () => ok(MOCK_FORM_RESPONSES),

  listLocations: () => ok(MOCK_LOCATIONS),
  addLocation: () => ok({ id: "new-location" }),
  updateLocation: () => ok({ id: "updated" }),
  deleteLocation: () => ok(null),

  listMinigameTemplates: () => ok([]),
  addMinigameTemplate: () => ok({ id: "new-template" }),
  updateMinigameTemplate: () => ok({ id: "updated", version: 2 }),
  deleteMinigameTemplate: () => ok(null),

  listEventMinigames: () => ok([]),
  attachMinigameToEvent: () => ok({ id: "new-instance", type: "poll" }),
  setMinigameState: (_slug: string, id: string, state: string) =>
    ok({ id, state }),
  advanceQuizQuestion: (_slug: string, id: string) =>
    ok({ id, currentQuestionIndex: 0 }),
  removeMinigameFromEvent: () => ok(null),

  triggerRebuild: () => ok(null),
};

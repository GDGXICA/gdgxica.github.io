import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { GITHUB_TOKEN } from "./config";
import { requireRole, requireAuth } from "./middleware/auth";
import { validateParamId } from "./middleware/validate";
import { validateBody } from "./middleware/validateBody";
import {
  eventSchema,
  speakerSchema,
  sponsorSchema,
  teamMemberSchema,
  locationSchema,
  minigameTemplateSchema,
  minigameInstanceCreateSchema,
  minigameStateSchema,
  minigameJoinSchema,
  minigameWordHiddenSchema,
} from "./schemas";
import { register } from "./handlers/auth";
import * as events from "./handlers/events";
import * as team from "./handlers/team";
import * as speakers from "./handlers/speakers";
import * as sponsors from "./handlers/sponsors";
import * as stats from "./handlers/stats";
import * as users from "./handlers/users";
import * as forms from "./handlers/forms";
import { triggerRebuild } from "./handlers/rebuild";
import * as locations from "./handlers/locations";
import * as minigameTemplates from "./handlers/minigameTemplates";
import * as minigameInstances from "./handlers/minigameInstances";
import * as minigameJoin from "./handlers/minigameJoin";
import * as minigameWords from "./handlers/minigameWords";

admin.initializeApp();

const ALLOWED_ORIGINS = [
  "https://gdgica.com",
  "https://appgdgica.web.app",
  "https://appgdgica.firebaseapp.com",
  "http://localhost:4321",
];

const app = express();
// Firebase Hosting + Cloud Functions sits behind exactly one Google
// Frontend hop, so trust a single proxy. Setting `true` would let
// callers spoof X-Forwarded-For and bypass IP-based rate limiting.
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json({ limit: "1mb" }));

// Outer perimeter limit: large window, generous cap. Protects against
// raw IP floods that haven't yet been authenticated.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests, try again later" },
  })
);

// Per-user mutation limit: applies after auth, keys by Firebase UID so
// abusive admins/organizers can't spam writes (and exhaust the GitHub
// API quota for the data repo) by rotating IPs.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = (req as { user?: { uid?: string } }).user?.uid;
    if (uid) return `u:${uid}`;
    // express-rate-limit v8 requires routing IP-based keys through
    // ipKeyGenerator() so IPv6 addresses are normalized and can't be
    // used to bypass the limit by rotating the suffix.
    return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },
  message: {
    success: false,
    error: "Too many write requests, slow down",
  },
});

// Public participant /join endpoint runs on Firebase anon tokens, which
// any client can mint without cost — UID-based limiting is therefore
// bypassable. We pin this limiter to the IP only.
const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  message: {
    success: false,
    error: "Demasiados intentos, espera un momento",
  },
});

const vid = validateParamId("id");
const vuid = validateParamId("uid");

// Auth
app.post("/api/auth/register", requireAuth(), register);

// Events
app.get("/api/events", requireRole("organizer"), events.listEvents);
app.get("/api/events/:id", requireRole("organizer"), vid, events.getEvent);
app.post(
  "/api/events",
  requireRole("organizer"),
  writeLimiter,
  validateBody(eventSchema),
  events.createEvent
);
app.put(
  "/api/events/:id",
  requireRole("organizer"),
  vid,
  writeLimiter,
  validateBody(eventSchema),
  events.updateEvent
);
app.delete(
  "/api/events/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  events.deleteEvent
);

// Team
app.get("/api/team", requireRole("organizer"), team.listTeam);
app.post(
  "/api/team",
  requireRole("admin"),
  writeLimiter,
  validateBody(teamMemberSchema),
  team.addTeamMember
);
app.put(
  "/api/team/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  validateBody(teamMemberSchema),
  team.updateTeamMember
);
app.delete(
  "/api/team/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  team.deleteTeamMember
);

// Speakers
app.get("/api/speakers", requireRole("organizer"), speakers.listSpeakers);
app.post(
  "/api/speakers",
  requireRole("organizer"),
  writeLimiter,
  validateBody(speakerSchema),
  speakers.addSpeaker
);
app.put(
  "/api/speakers/:id",
  requireRole("organizer"),
  vid,
  writeLimiter,
  validateBody(speakerSchema),
  speakers.updateSpeaker
);
app.delete(
  "/api/speakers/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  speakers.deleteSpeaker
);

// Sponsors
app.get("/api/sponsors", requireRole("admin"), sponsors.listSponsors);
app.post(
  "/api/sponsors",
  requireRole("admin"),
  writeLimiter,
  validateBody(sponsorSchema),
  sponsors.addSponsor
);
app.put(
  "/api/sponsors/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  validateBody(sponsorSchema),
  sponsors.updateSponsor
);
app.delete(
  "/api/sponsors/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  sponsors.deleteSponsor
);

// Stats
app.get("/api/stats", requireRole("organizer"), stats.getStats);
app.put("/api/stats", requireRole("admin"), writeLimiter, stats.updateStats);

// Users
app.get("/api/users", requireRole("admin"), users.listUsers);
app.patch(
  "/api/users/:uid/role",
  requireRole("admin"),
  vuid,
  writeLimiter,
  users.updateRole
);

// Forms
app.get("/api/forms", requireRole("organizer"), forms.listForms);
app.post("/api/forms", requireRole("admin"), writeLimiter, forms.addForm);
app.put(
  "/api/forms/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  forms.updateForm
);
app.delete(
  "/api/forms/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  forms.deleteForm
);
app.get(
  "/api/forms/:id/responses",
  requireRole("organizer"),
  vid,
  forms.getFormResponses
);

// Locations
app.get("/api/locations", requireRole("organizer"), locations.list);
app.post(
  "/api/locations",
  requireRole("organizer"),
  writeLimiter,
  validateBody(locationSchema),
  locations.create
);
app.put(
  "/api/locations/:id",
  requireRole("organizer"),
  vid,
  writeLimiter,
  validateBody(locationSchema),
  locations.update
);
app.delete(
  "/api/locations/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  locations.remove
);

// Minigame Templates (admin-only — full CRUD)
app.get(
  "/api/minigame-templates",
  requireRole("admin"),
  minigameTemplates.list
);
app.post(
  "/api/minigame-templates",
  requireRole("admin"),
  writeLimiter,
  validateBody(minigameTemplateSchema),
  minigameTemplates.create
);
app.put(
  "/api/minigame-templates/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  validateBody(minigameTemplateSchema),
  minigameTemplates.update
);
app.delete(
  "/api/minigame-templates/:id",
  requireRole("admin"),
  vid,
  writeLimiter,
  minigameTemplates.remove
);

// Minigame Instances (admin-only — attach templates to events)
const slugP = validateParamId("slug");
app.get(
  "/api/events/:slug/minigames",
  requireRole("admin"),
  slugP,
  minigameInstances.list
);
app.post(
  "/api/events/:slug/minigames",
  requireRole("admin"),
  slugP,
  writeLimiter,
  validateBody(minigameInstanceCreateSchema),
  minigameInstances.attach
);
app.patch(
  "/api/events/:slug/minigames/:id/state",
  requireRole("admin"),
  slugP,
  vid,
  writeLimiter,
  validateBody(minigameStateSchema),
  minigameInstances.setState
);
app.post(
  "/api/events/:slug/minigames/:id/quiz/advance",
  requireRole("admin"),
  slugP,
  vid,
  writeLimiter,
  minigameInstances.quizAdvance
);
app.delete(
  "/api/events/:slug/minigames/:id",
  requireRole("admin"),
  slugP,
  vid,
  writeLimiter,
  minigameInstances.remove
);

// Public participant join — accepts any Firebase token (incl. anon).
app.post(
  "/api/events/:slug/minigames/join",
  requireAuth(),
  slugP,
  joinLimiter,
  validateBody(minigameJoinSchema),
  minigameJoin.join
);

// Word cloud moderation + bingo winners (admin-only)
const vwid = validateParamId("wordId");
app.get(
  "/api/events/:slug/minigames/:id/words",
  requireRole("admin"),
  slugP,
  vid,
  minigameWords.listWords
);
app.patch(
  "/api/events/:slug/minigames/:id/words/:wordId/hidden",
  requireRole("admin"),
  slugP,
  vid,
  vwid,
  writeLimiter,
  validateBody(minigameWordHiddenSchema),
  minigameWords.setWordHidden
);
app.get(
  "/api/events/:slug/minigames/:id/winners",
  requireRole("admin"),
  slugP,
  vid,
  minigameWords.listWinners
);

// Rebuild
app.post("/api/rebuild", requireRole("admin"), writeLimiter, triggerRebuild);

export const api = onRequest(
  { secrets: [GITHUB_TOKEN], invoker: "public" },
  app
);

// Firestore trigger: incrementally maintains aggregates/current per
// minigame instance whenever a participant response is created.
export { onMinigameResponseWritten } from "./triggers/recomputeAggregates";

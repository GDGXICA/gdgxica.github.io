import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { GITHUB_TOKEN } from "./config";
import { requireRole, requireAuth } from "./middleware/auth";
import { validateParamId } from "./middleware/validate";
import { register } from "./handlers/auth";
import * as events from "./handlers/events";
import * as team from "./handlers/team";
import * as speakers from "./handlers/speakers";
import * as sponsors from "./handlers/sponsors";
import * as stats from "./handlers/stats";
import * as users from "./handlers/users";
import * as forms from "./handlers/forms";
import { triggerRebuild } from "./handlers/rebuild";

admin.initializeApp();

const ALLOWED_ORIGINS = [
  "https://gdgica.com",
  "https://appgdgica.web.app",
  "https://appgdgica.firebaseapp.com",
  "http://localhost:4321",
];

const app = express();
app.set("trust proxy", true);
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
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { success: false, error: "Too many requests, try again later" },
  })
);

const vid = validateParamId("id");
const vuid = validateParamId("uid");

// Auth
app.post("/api/auth/register", requireAuth(), register);

// Events
app.get("/api/events", requireRole("organizer"), events.listEvents);
app.get("/api/events/:id", requireRole("organizer"), vid, events.getEvent);
app.post("/api/events", requireRole("organizer"), events.createEvent);
app.put("/api/events/:id", requireRole("organizer"), vid, events.updateEvent);
app.delete("/api/events/:id", requireRole("admin"), vid, events.deleteEvent);

// Team
app.get("/api/team", requireRole("organizer"), team.listTeam);
app.post("/api/team", requireRole("admin"), team.addTeamMember);
app.put("/api/team/:id", requireRole("admin"), vid, team.updateTeamMember);
app.delete("/api/team/:id", requireRole("admin"), vid, team.deleteTeamMember);

// Speakers
app.get("/api/speakers", requireRole("organizer"), speakers.listSpeakers);
app.post("/api/speakers", requireRole("organizer"), speakers.addSpeaker);
app.put(
  "/api/speakers/:id",
  requireRole("organizer"),
  vid,
  speakers.updateSpeaker
);
app.delete(
  "/api/speakers/:id",
  requireRole("admin"),
  vid,
  speakers.deleteSpeaker
);

// Sponsors
app.get("/api/sponsors", requireRole("admin"), sponsors.listSponsors);
app.post("/api/sponsors", requireRole("admin"), sponsors.addSponsor);
app.put("/api/sponsors/:id", requireRole("admin"), vid, sponsors.updateSponsor);
app.delete(
  "/api/sponsors/:id",
  requireRole("admin"),
  vid,
  sponsors.deleteSponsor
);

// Stats
app.get("/api/stats", requireRole("organizer"), stats.getStats);
app.put("/api/stats", requireRole("admin"), stats.updateStats);

// Users
app.get("/api/users", requireRole("admin"), users.listUsers);
app.patch("/api/users/:uid/role", requireRole("admin"), vuid, users.updateRole);

// Forms
app.get("/api/forms", requireRole("organizer"), forms.listForms);
app.post("/api/forms", requireRole("admin"), forms.addForm);
app.put("/api/forms/:id", requireRole("admin"), vid, forms.updateForm);
app.delete("/api/forms/:id", requireRole("admin"), vid, forms.deleteForm);
app.get(
  "/api/forms/:id/responses",
  requireRole("organizer"),
  vid,
  forms.getFormResponses
);

// Rebuild
app.post("/api/rebuild", requireRole("admin"), triggerRebuild);

export const api = onRequest(
  { secrets: [GITHUB_TOKEN], invoker: "public" },
  app
);

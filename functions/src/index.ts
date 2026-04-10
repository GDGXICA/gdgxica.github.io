import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import { GITHUB_TOKEN } from "./config";
import { requireRole, requireAuth } from "./middleware/auth";
import { register } from "./handlers/auth";
import * as events from "./handlers/events";
import * as team from "./handlers/team";
import * as speakers from "./handlers/speakers";
import * as sponsors from "./handlers/sponsors";
import * as stats from "./handlers/stats";
import * as users from "./handlers/users";
import { triggerRebuild } from "./handlers/rebuild";

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Auth
app.post("/api/auth/register", requireAuth(), register);

// Events
app.get("/api/events", requireRole("organizer"), events.listEvents);
app.get("/api/events/:id", requireRole("organizer"), events.getEvent);
app.post("/api/events", requireRole("organizer"), events.createEvent);
app.put("/api/events/:id", requireRole("organizer"), events.updateEvent);
app.delete("/api/events/:id", requireRole("admin"), events.deleteEvent);

// Team
app.get("/api/team", requireRole("organizer"), team.listTeam);
app.post("/api/team", requireRole("admin"), team.addTeamMember);
app.put("/api/team/:id", requireRole("admin"), team.updateTeamMember);
app.delete("/api/team/:id", requireRole("admin"), team.deleteTeamMember);

// Speakers
app.get("/api/speakers", requireRole("organizer"), speakers.listSpeakers);
app.post("/api/speakers", requireRole("organizer"), speakers.addSpeaker);
app.put("/api/speakers/:id", requireRole("organizer"), speakers.updateSpeaker);
app.delete("/api/speakers/:id", requireRole("admin"), speakers.deleteSpeaker);

// Sponsors
app.get("/api/sponsors", requireRole("admin"), sponsors.listSponsors);
app.post("/api/sponsors", requireRole("admin"), sponsors.addSponsor);
app.put("/api/sponsors/:id", requireRole("admin"), sponsors.updateSponsor);
app.delete("/api/sponsors/:id", requireRole("admin"), sponsors.deleteSponsor);

// Stats
app.get("/api/stats", requireRole("organizer"), stats.getStats);
app.put("/api/stats", requireRole("admin"), stats.updateStats);

// Users
app.get("/api/users", requireRole("admin"), users.listUsers);
app.patch("/api/users/:uid/role", requireRole("admin"), users.updateRole);

// Rebuild
app.post("/api/rebuild", requireRole("admin"), triggerRebuild);

export const api = onRequest({ secrets: [GITHUB_TOKEN] }, app);

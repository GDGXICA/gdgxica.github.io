import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import { GITHUB_TOKEN } from "./config";
import { requireRole, requireAuth } from "./middleware/auth";
import { register } from "./handlers/auth";
import * as events from "./handlers/events";
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

// Users
app.get("/api/users", requireRole("admin"), users.listUsers);
app.patch("/api/users/:uid/role", requireRole("admin"), users.updateRole);

// Rebuild
app.post("/api/rebuild", requireRole("admin"), triggerRebuild);

export const api = onRequest({ secrets: [GITHUB_TOKEN] }, app);

import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { GITHUB_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD } from "./config";
import { requirePermission, requireAuth } from "./middleware/auth";
import { isAllowedOrigin, rejectDisallowedOrigin } from "./middleware/cors";
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
  certificateSendSchema,
  checkinImportSchema,
  credentialCreateSchema,
  credentialImageSchema,
  credentialBevyStatusSchema,
  credentialPhotoModerationSchema,
} from "./schemas";
import { register } from "./handlers/auth";
import * as events from "./handlers/events";
import * as team from "./handlers/team";
import * as speakers from "./handlers/speakers";
import * as sponsors from "./handlers/sponsors";
import * as stats from "./handlers/stats";
import * as users from "./handlers/users";
import * as audit from "./handlers/audit";
import * as access from "./handlers/access";
import * as eventStaff from "./handlers/eventStaff";
import * as proposals from "./handlers/proposals";
import * as forms from "./handlers/forms";
import { triggerRebuild } from "./handlers/rebuild";
import * as locations from "./handlers/locations";
import * as minigameTemplates from "./handlers/minigameTemplates";
import * as minigameInstances from "./handlers/minigameInstances";
import * as minigameJoin from "./handlers/minigameJoin";
import * as minigameWords from "./handlers/minigameWords";
import * as minigameRoulette from "./handlers/minigameRoulette";
import * as minigameBingo from "./handlers/minigameBingo";
import * as certificates from "./handlers/certificates";
import * as checkin from "./handlers/checkin";
import * as credentials from "./handlers/credentials";

admin.initializeApp();

const app = express();
// Firebase Hosting + Cloud Functions sits behind exactly one Google
// Frontend hop, so trust a single proxy. Setting `true` would let
// callers spoof X-Forwarded-For and bypass IP-based rate limiting.
app.set("trust proxy", 1);

// Registered BEFORE cors(), which answers OPTIONS itself and never calls
// next() — anything after it would be dead code for preflight. See the
// note in middleware/cors.ts for what this does and does not cover.
app.use(rejectDisallowedOrigin);
app.use(
  cors({
    // Disallowed origins were already answered with 403 above, so this
    // only decides which headers to attach for callers let through.
    origin: (origin, callback) =>
      callback(null, !origin || isAllowedOrigin(origin)),
  })
);
app.use(express.json({ limit: "1mb" }));

// Latched so the warning below fires once per cold start, not per request.
let warnedMissingIp = false;

// Outer perimeter limit: large window, generous cap. Protects against
// raw IP floods that haven't yet been authenticated.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rather than fall back to a shared key. Keying every caller
    // into one bucket would turn an undefined req.ip into a global 429
    // for everyone after 300 requests — including the check-in panel
    // mid-event. Losing the perimeter limit is the milder failure: the
    // per-uid writeLimiter still guards every expensive route.
    //
    // Announced once per cold start rather than per request: skipping is
    // a real weakening of the outer defence, and the previous behaviour
    // at least made noise (it threw ERR_ERL_UNDEFINED_IP_ADDRESS, which
    // is how this was noticed). Silence here would mean the API serves
    // unlimited unauthenticated traffic with nothing saying so.
    skip: (req) => {
      if (req.ip) return false;
      if (!warnedMissingIp) {
        warnedMissingIp = true;
        logger.warn(
          "req.ip is undefined; perimeter rate limit is being skipped. " +
            "Check the proxy configuration — the per-uid writeLimiter is " +
            "still active."
        );
      }
      return true;
    },
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip as string)}`,
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

// Calling bingo balls does not belong on writeLimiter. That limiter caps
// an organizer at 30 writes/minute to protect the GitHub API quota for
// the data repo, and a ball touches neither — it is one small update to
// one Firestore doc. Sharing it meant an admin calling a 48-ball game at
// any pace faster than one ball every two seconds got "slow down" partway
// through, with the rest of the bag unreachable (caught in an end-to-end
// run: it died on ball 25). The real ceiling is the bag itself: once the
// sequence is exhausted the endpoint 400s, so an instance can never serve
// more draws than it has terms.
const ballLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = (req as { user?: { uid?: string } }).user?.uid;
    return uid ? `u:${uid}` : `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },
  message: {
    success: false,
    error: "Demasiadas bolas seguidas, espera un momento",
  },
});

// Classic-bingo claims are public and anon-token-backed like /join, so
// they are keyed by IP too — but on their own counter. A whole venue
// usually shares one NAT address, and sharing joinLimiter would let the
// scan-the-QR rush use up the budget and then throttle the first winner
// at the exact moment they press ¡BINGO!. The cap is comfortable because
// the staggered card dealing keeps genuine claims minutes apart, and the
// handler verifies each one against the balls it actually called.
const claimLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  message: {
    success: false,
    error: "Demasiados intentos, espera un momento",
  },
});

// Public credential submissions. Same reasoning as joinLimiter: this
// endpoint accepts anonymous Firebase tokens, which any client mints for
// free, so a UID-based key is bypassable and the limit is pinned to the IP.
//
// 8/hour rather than something tighter because the realistic false positive
// is a university or office NAT putting dozens of attendees behind one
// address, and an actionable message matters more than the exact number.
// Deliberately NOT keyed by DNI — that would reintroduce the lockout that
// allowing duplicate DNIs exists to avoid.
//
// Counter propio, no compartido con claimLimiter: son públicos los dos y
// van por IP, pero mezclarlos dejaría que la avalancha de credenciales
// agotara el cupo de quien canta bingo, y al revés.
const credentialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  message: {
    success: false,
    error:
      "Demasiados intentos desde esta red. Si estás en una red compartida " +
      "(universidad u oficina), escríbenos a hola@gdgica.com.",
  },
});

const vid = validateParamId("id");
const vuid = validateParamId("uid");
const slugP = validateParamId("slug");

// Auth
app.post("/api/auth/register", requireAuth(), register);

// Events
app.get("/api/events", requirePermission("events:read"), events.listEvents);
app.get(
  "/api/events/:id",
  requirePermission("events:read"),
  vid,
  events.getEvent
);
app.post(
  "/api/events",
  requirePermission("events:write"),
  writeLimiter,
  validateBody(eventSchema),
  events.createEvent
);
app.put(
  "/api/events/:id",
  requirePermission("events:write"),
  vid,
  writeLimiter,
  validateBody(eventSchema),
  events.updateEvent
);
app.delete(
  "/api/events/:id",
  requirePermission("events:delete"),
  vid,
  writeLimiter,
  events.deleteEvent
);

// Team
app.get("/api/team", requirePermission("team:read"), team.listTeam);
app.post(
  "/api/team",
  requirePermission("team:write"),
  writeLimiter,
  validateBody(teamMemberSchema),
  team.addTeamMember
);
app.put(
  "/api/team/:id",
  requirePermission("team:write"),
  vid,
  writeLimiter,
  validateBody(teamMemberSchema),
  team.updateTeamMember
);
app.delete(
  "/api/team/:id",
  requirePermission("team:write"),
  vid,
  writeLimiter,
  team.deleteTeamMember
);

// Speakers
app.get(
  "/api/speakers",
  requirePermission("speakers:read"),
  speakers.listSpeakers
);
app.post(
  "/api/speakers",
  requirePermission("speakers:write"),
  writeLimiter,
  validateBody(speakerSchema),
  speakers.addSpeaker
);
app.put(
  "/api/speakers/:id",
  requirePermission("speakers:write"),
  vid,
  writeLimiter,
  validateBody(speakerSchema),
  speakers.updateSpeaker
);
app.delete(
  "/api/speakers/:id",
  requirePermission("speakers:delete"),
  vid,
  writeLimiter,
  speakers.deleteSpeaker
);

// Sponsors
app.get(
  "/api/sponsors",
  requirePermission("sponsors:read"),
  sponsors.listSponsors
);
app.post(
  "/api/sponsors",
  requirePermission("sponsors:write"),
  writeLimiter,
  validateBody(sponsorSchema),
  sponsors.addSponsor
);
app.put(
  "/api/sponsors/:id",
  requirePermission("sponsors:write"),
  vid,
  writeLimiter,
  validateBody(sponsorSchema),
  sponsors.updateSponsor
);
app.delete(
  "/api/sponsors/:id",
  requirePermission("sponsors:delete"),
  vid,
  writeLimiter,
  sponsors.deleteSponsor
);

// Stats
app.get("/api/stats", requirePermission("stats:read"), stats.getStats);
app.put(
  "/api/stats",
  requirePermission("stats:write"),
  writeLimiter,
  stats.updateStats
);

// Users
app.get("/api/users", requirePermission("users:read"), users.listUsers);
app.patch(
  "/api/users/:uid/role",
  requirePermission("users:role:write"),
  vuid,
  writeLimiter,
  users.updateRole
);
app.patch(
  "/api/users/:uid/status",
  requirePermission("users:role:write"),
  vuid,
  writeLimiter,
  users.updateStatus
);
app.put(
  "/api/users/:uid/grants",
  requirePermission("users:role:write"),
  vuid,
  writeLimiter,
  users.updateGrants
);

// Audit log — de solo lectura, y solo para quien tenga `audit:read`.
app.get("/api/audit", requirePermission("audit:read"), audit.listAudit);

// Access — solicitudes e invitaciones.
//
// Crear una solicitud y canjear una invitación son las dos únicas rutas que
// puede llamar alguien SIN permisos (solo con sesión iniciada), así que
// llevan un limitador propio y estrecho: son la superficie que ve cualquiera
// con una cuenta de Google.
const accessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Pinned to the IP, not the uid: these two routes accept any Firebase
  // token, and anonymous ones can be minted for free — a per-uid bucket is
  // bypassable by rotating accounts, which is exactly what a token-guessing
  // client would do. Same reasoning as joinLimiter above.
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  message: {
    success: false,
    error: "Demasiados intentos, inténtalo más tarde",
  },
});

// Propuestas de contenido. `proposals:create` basta para crear y listar —el
// handler filtra a las propias de quien no revisa—, mientras que revisar y
// publicar exigen `proposals:review`. Publicar es un paso aparte de aprobar:
// aceptar el contenido y escribirlo en el repo público son decisiones
// distintas.
app.get(
  "/api/proposals",
  requirePermission("proposals:create"),
  proposals.listProposals
);
app.post(
  "/api/proposals",
  requirePermission("proposals:create"),
  writeLimiter,
  proposals.createProposal
);
app.put(
  "/api/proposals/:id",
  requirePermission("proposals:create"),
  vid,
  writeLimiter,
  proposals.updateProposal
);
app.post(
  "/api/proposals/:id/review",
  requirePermission("proposals:review"),
  vid,
  writeLimiter,
  proposals.reviewProposal
);
app.post(
  "/api/proposals/:id/publish",
  requirePermission("proposals:review"),
  vid,
  writeLimiter,
  proposals.publishProposal
);

// Asignaciones de staff por evento. Gestionarlas exige `users:role:write`:
// asignar a alguien a un evento es concederle permisos, aunque acotados, y
// debe pesar lo mismo que cambiar un rol.
app.get(
  "/api/events/:slug/staff",
  requirePermission("roster:read", { scopeParam: "slug" }),
  slugP,
  eventStaff.listStaff
);
app.put(
  "/api/events/:slug/staff/:uid",
  requirePermission("users:role:write"),
  slugP,
  vuid,
  writeLimiter,
  eventStaff.assignStaff
);
app.delete(
  "/api/events/:slug/staff/:uid",
  requirePermission("users:role:write"),
  slugP,
  vuid,
  writeLimiter,
  eventStaff.removeStaff
);

// Eventos asignados a quien llama. Solo necesita sesión: devuelve
// exclusivamente las asignaciones propias, nunca las de otra persona.
app.get("/api/me/events", requireAuth(), eventStaff.listMyEvents);

app.get("/api/access/requests/me", requireAuth(), access.getMyRequest);
app.post(
  "/api/access/requests",
  requireAuth(),
  accessLimiter,
  access.createRequest
);
app.post(
  "/api/access/invitations/redeem",
  requireAuth(),
  accessLimiter,
  access.redeemInvitation
);

app.get(
  "/api/access/requests",
  requirePermission("access:review"),
  access.listRequests
);
app.post(
  "/api/access/requests/:uid/decide",
  requirePermission("access:review"),
  vuid,
  writeLimiter,
  access.decideRequest
);
app.get(
  "/api/access/invitations",
  requirePermission("access:review"),
  access.listInvitations
);
app.post(
  "/api/access/invitations",
  requirePermission("access:review"),
  writeLimiter,
  access.createInvitation
);
app.delete(
  "/api/access/invitations/:id",
  requirePermission("access:review"),
  vid,
  writeLimiter,
  access.revokeInvitation
);

// Forms
app.get("/api/forms", requirePermission("forms:read"), forms.listForms);
app.post(
  "/api/forms",
  requirePermission("forms:write"),
  writeLimiter,
  forms.addForm
);
app.put(
  "/api/forms/:id",
  requirePermission("forms:write"),
  vid,
  writeLimiter,
  forms.updateForm
);
app.delete(
  "/api/forms/:id",
  requirePermission("forms:write"),
  vid,
  writeLimiter,
  forms.deleteForm
);
app.get(
  "/api/forms/:id/responses",
  requirePermission("forms:responses:read"),
  vid,
  forms.getFormResponses
);

// Locations
app.get("/api/locations", requirePermission("locations:read"), locations.list);
app.post(
  "/api/locations",
  requirePermission("locations:write"),
  writeLimiter,
  validateBody(locationSchema),
  locations.create
);
app.put(
  "/api/locations/:id",
  requirePermission("locations:write"),
  vid,
  writeLimiter,
  validateBody(locationSchema),
  locations.update
);
app.delete(
  "/api/locations/:id",
  requirePermission("locations:delete"),
  vid,
  writeLimiter,
  locations.remove
);

// Minigame Templates — la plantilla es global, no cuelga de ningún evento,
// así que su permiso nunca se acota por alcance.
app.get(
  "/api/minigame-templates",
  requirePermission("minigames:template:read"),
  minigameTemplates.list
);
app.post(
  "/api/minigame-templates",
  requirePermission("minigames:template:write"),
  writeLimiter,
  validateBody(minigameTemplateSchema),
  minigameTemplates.create
);
app.put(
  "/api/minigame-templates/:id",
  requirePermission("minigames:template:write"),
  vid,
  writeLimiter,
  validateBody(minigameTemplateSchema),
  minigameTemplates.update
);
app.delete(
  "/api/minigame-templates/:id",
  requirePermission("minigames:template:write"),
  vid,
  writeLimiter,
  minigameTemplates.remove
);

// Minigame Instances — acotadas al evento: `scopeParam` permite que un
// voluntario asignado a ESE evento las opere, sin darle los demás.
const minigamesOfEvent = () =>
  requirePermission("minigames:operate", { scopeParam: "slug" });

app.get(
  "/api/events/:slug/minigames",
  minigamesOfEvent(),
  slugP,
  minigameInstances.list
);
app.post(
  "/api/events/:slug/minigames",
  minigamesOfEvent(),
  slugP,
  writeLimiter,
  validateBody(minigameInstanceCreateSchema),
  minigameInstances.attach
);
app.patch(
  "/api/events/:slug/minigames/:id/state",
  minigamesOfEvent(),
  slugP,
  vid,
  writeLimiter,
  validateBody(minigameStateSchema),
  minigameInstances.setState
);
app.post(
  "/api/events/:slug/minigames/:id/quiz/advance",
  minigamesOfEvent(),
  slugP,
  vid,
  writeLimiter,
  minigameInstances.quizAdvance
);
app.delete(
  "/api/events/:slug/minigames/:id",
  minigamesOfEvent(),
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

// Public credential submission — accepts any Firebase token (incl. anon).
app.post(
  "/api/events/:slug/credentials",
  requireAuth(),
  slugP,
  credentialLimiter,
  validateBody(credentialCreateSchema),
  credentials.createCredential
);

// Attaching the composed card is a SECOND public call, not part of create:
// the group letter comes from a server-assigned sequence number, so the
// client cannot render the final card until create has returned. The
// handler pins the write to the anonymous UID that created the record.
app.patch(
  "/api/events/:slug/credentials/:id/image",
  requireAuth(),
  slugP,
  vid,
  credentialLimiter,
  validateBody(credentialImageSchema),
  credentials.attachCredentialImage
);

// Credential administration. Scoped with `scopeParam: "slug"` so a
// volunteer assigned to one event works that event's queue and nothing
// else — the same shape check-in already uses. Reading the list is gated
// by `roster:read` in firestore.rules, since a credential is attendee PII
// exactly like a roster row; these three are the write side.
app.patch(
  "/api/events/:slug/credentials/:id/bevy",
  requirePermission("credentials:operate", { scopeParam: "slug" }),
  slugP,
  vid,
  writeLimiter,
  validateBody(credentialBevyStatusSchema),
  credentials.setBevyStatus
);
app.patch(
  "/api/events/:slug/credentials/:id/photo",
  requirePermission("credentials:operate", { scopeParam: "slug" }),
  slugP,
  vid,
  writeLimiter,
  validateBody(credentialPhotoModerationSchema),
  credentials.moderatePhoto
);
app.post(
  "/api/events/:slug/credentials/:id/email/retry",
  requirePermission("credentials:operate", { scopeParam: "slug" }),
  slugP,
  vid,
  writeLimiter,
  credentials.retryEmail
);

// Roulette spin
app.post(
  "/api/events/:slug/minigames/:id/roulette/spin",
  minigamesOfEvent(),
  slugP,
  vid,
  writeLimiter,
  minigameRoulette.spin
);

// Classic bingo: whoever runs the event calls one ball at a time...
//
// Llegó de main como `requireRole("admin")`, que esta rama elimina. Cantar
// bolas es operar los minijuegos DE ESE evento, igual que girar la ruleta o
// avanzar el quiz, así que va con el mismo permiso acotado: un voluntario
// asignado al evento puede llevarlo, y nadie puede tocar el bingo de un
// evento que no es suyo.
app.post(
  "/api/events/:slug/minigames/:id/bingo/draw",
  minigamesOfEvent(),
  slugP,
  vid,
  ballLimiter,
  minigameBingo.drawBall
);
// ...and participants claim the line themselves. The handler re-derives
// the win from the server's own record of called balls, so a flood of
// bogus claims cannot manufacture a winner.
app.post(
  "/api/events/:slug/minigames/:id/bingo/claim",
  requireAuth(),
  slugP,
  vid,
  claimLimiter,
  minigameBingo.claim
);

// Word cloud moderation + bingo winners
const vwid = validateParamId("wordId");
app.get(
  "/api/events/:slug/minigames/:id/words",
  minigamesOfEvent(),
  slugP,
  vid,
  minigameWords.listWords
);
app.patch(
  "/api/events/:slug/minigames/:id/words/:wordId/hidden",
  minigamesOfEvent(),
  slugP,
  vid,
  vwid,
  writeLimiter,
  validateBody(minigameWordHiddenSchema),
  minigameWords.setWordHidden
);
app.get(
  "/api/events/:slug/minigames/:id/winners",
  minigamesOfEvent(),
  slugP,
  vid,
  minigameWords.listWinners
);

// Certificates — generate per recipient and email; nothing is stored.
app.post(
  "/api/certificates/send",
  requirePermission("certificates:send"),
  writeLimiter,
  validateBody(certificateSendSchema),
  certificates.sendCertificates
);

// On-site check-in. The roster import is the only write that goes
// through the API — volunteers toggle check-in straight against
// Firestore so the write can be queued when venue wifi drops.
app.post(
  "/api/events/:slug/checkin/import",
  requirePermission("checkin:import", { scopeParam: "slug" }),
  slugP,
  writeLimiter,
  validateBody(checkinImportSchema),
  checkin.importRoster
);

// Rebuild
app.post(
  "/api/rebuild",
  requirePermission("rebuild:trigger"),
  writeLimiter,
  triggerRebuild
);

export const api = onRequest(
  {
    secrets: [GITHUB_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD],
    invoker: "public",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  app
);

// Firestore trigger: incrementally maintains aggregates/current per
// minigame instance whenever a participant response is created.
export { onMinigameResponseWritten } from "./triggers/recomputeAggregates";

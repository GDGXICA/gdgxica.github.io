# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Pre-commit hooks run automatically via Husky + lint-staged (ESLint + Prettier on staged files).

## Architecture

**Astro 5 static site** for the GDG ICA community (Spanish-language content). TailwindCSS 4 for styling, React 19 only for interactive islands.

### Routing & Pages

File-based routing under `src/pages/`:

- `/` — Homepage
- `/events` — Events listing
- `/events/[slug]` — Dynamic event detail pages (slug = JSON filename without extension)
- `/team`, `/about`, `/sponsors`, `/volunteers`, `/gallery` — Static pages
- `*.json.ts` endpoints — API routes returning collection data

### Data Layer

All content is sourced from the external repo [`GDGXICA/gdg-ica-data`](https://github.com/GDGXICA/gdg-ica-data) via custom Astro Content Loaders that fetch from `raw.githubusercontent.com` at build time. Schemas are defined with Zod in `src/content.config.ts`.

**Loaders** (`src/loaders/`):

- `fetch-gdg-data.ts` — Base fetch utility with caching + helpers (stripDomain, formatSpanishDate, expandCategory, etc.)
- `transform-events.ts` — Fetches events + resolves `speaker_ids` into embedded speaker objects
- `transform-team.ts` — Splits `about/team.json` into `organizers` and `members` collections by `type` field
- `transform-sponsors.ts` — Transforms `about/partners.json` into sponsors schema
- `transform-gallery.ts` — Transforms gallery with derived `type` from `tag`
- `transform-volunteers.ts` — Loads volunteers (graceful fallback to `[]` if not yet available)

**Collections**: `events`, `gallery`, `members`, `organizers`, `sponsors`, `volunteers`.

**Events** are the most complex: each has speakers (resolved from speaker refs), sponsors, schedule (flat array or `TrackSessions` for multi-track), location, status, category, tags, and registration link.

### Component Pattern

- **`.astro` components** — Used for all static/SSR content (no JS sent to browser). Located in `src/components/`.
- **`.jsx/.tsx` React components** — Only for client-side interactivity (`src/components/react/`). Public: `Gallery.jsx`, `SharedButton.jsx`. Admin panel: `src/components/react/admin/`.
- **Path alias:** `@/` maps to `src/`

### Key Design Details

- Google brand colors defined as CSS variables in `src/styles/global.css`: blue `#2463eb`, red `#ef4444`, yellow `#ebb308`, green `#16a34a`
- `container` utility class provides the standard max-width wrapper
- Event slugs are derived from JSON filenames (e.g., `devfest-2025.json` → `/events/devfest-2025`)
- Images stored in `public/` subdirectories (`events/`, `speakers/`, `sponsors/`, `team/`, `gallery/`) — referenced as absolute paths

### Admin Panel

Protected admin UI at `/admin/*` using React islands (`client:load`). Firebase Auth (Google Sign-In) with **permission-based** access control.

**Permissions model** — `functions/src/auth/permissions.ts` is the single authority; `src/lib/permissions.ts` mirrors it for the UI, and `functions/src/auth/permissions.test.ts` fails if the two drift.

- **Permissions**, not role levels, gate every route: `requirePermission("events:write")` in `functions/src/middleware/auth.ts`. There is no role hierarchy — a ranking cannot express "check-in for this one event".
- **Roles** are named bundles of permissions: `member` (no panel access, the default for anyone who signs in), `contributor` (external people; proposes content for review), `volunteer` (per-event operations), `organizer`, `admin`.
- **Per-event scope**: a bundle's `perEvent` permissions only apply inside events where the user is listed in `events/{slug}/staff/{uid}` with an unexpired assignment. The staff lookup is only paid when it can change the answer.
- **Per-user overrides**: `users/{uid}.grants` (additive, each with a `scope` and optional `expiresAt`) and `.revocations` (subtractive). Effective = `bundle(role) ∪ active grants − revocations`, and empty when `status === "suspended"`.
- Enforced in three layers: the API middleware, `firestore.rules` (`canOnEvent()`), and the UI (`can()` from `useAuth()`). The UI layer is cosmetic — hiding a button protects nothing.
- Roles and grants are never client-writable; `users/{uid}` self-create is pinned to a bare `member` doc with no grants.

**Architecture:** Static HTML shells + React islands → Cloud Functions API (`/api/*` via Hosting rewrite) → GitHub API writes to `gdg-ica-data` → triggers site rebuild.

**Cloud Functions** (`functions/`):

- Express API with auth middleware (token verification + role checking)
- GitHub service for reading/writing files in `gdg-ica-data`
- Handlers: auth, events, team, speakers, sponsors, stats, users, rebuild
- Audit logging on all write operations to Firestore

**Firebase client** (`src/lib/`):

- `firebase.ts` — SDK init for project `appgdgica`
- `auth.ts` — Google Sign-In, token management
- `api.ts` — fetch wrapper with automatic ID token

**Admin pages:** `/admin` (dashboard), `/admin/events`, `/admin/team`, `/admin/speakers`, `/admin/sponsors`, `/admin/stats`, `/admin/users`, `/admin/roles` (read-only permission matrix), `/admin/audit` (audit log viewer)

**Access-control admin:** role, status and per-user grants are changed only through `PATCH /api/users/:uid/role`, `PATCH /api/users/:uid/status` and `PUT /api/users/:uid/grants`. All three require a written reason (stored in `audit_log`) and enforce two guards in `functions/src/handlers/users.ts`: no-escalation (you cannot assign, remove or grant beyond your own permissions) and last-admin (the final active admin cannot be demoted or suspended). `GET /api/audit` is paginated by document cursor and accepts at most one filter at a time — each filter has its own composite index in `firestore.indexes.json`.

**Firestore collections:** `users` (role, status, grants, revocations), `audit_log` (write history), `events/{slug}/staff` (per-event assignments)

### Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds on push to `main` and deploys to Firebase Hosting + Cloud Functions + Firestore rules using `FIREBASE_TOKEN` secret. Also triggers on `repository_dispatch` (`data-updated` event) so pushes to `gdg-ica-data` can trigger a site rebuild.

## Contribution Rules

- Branch naming: `feature/AmazingFeature`, `fix/BugName`, etc.
- Commit format: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
- No direct commits to `main`; PRs require ≥1 approval
- Discuss new dependencies before adding them
- No `!important` in CSS; use Tailwind utilities
- No `console.log` in production code

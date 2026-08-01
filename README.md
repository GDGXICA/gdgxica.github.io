# Google Developer Group (GDG) ICA — Official Website

[🌐 gdgica.com](https://gdgica.com) · [🖼️ Figma design](https://www.figma.com/design/OsE9m2hnvt7DjuI7e7Ocx3/GDG-ICA?node-id=0-1&t=XAHKhrJY81pkcRk6-1)

Static site for the GDG ICA community, built with Astro. All public content — events, speakers, team, sponsors, gallery — lives in the separate [`GDGXICA/gdg-ica-data`](https://github.com/GDGXICA/gdg-ica-data) repository and is pulled in at build time by the custom loaders in `src/loaders/`. CI clones that repo instead of fetching it over the CDN, so a build never picks up stale JSON.

Public pages: `/`, `/events`, `/events/[slug]`, `/team`, `/about`, `/sponsors`, `/volunteers`, `/gallery`. There is also an authenticated admin panel under `/admin/*`, backed by an Express API on Cloud Functions that writes to the data repo through the GitHub API.

## Stack

- [Astro 7](https://astro.build) — static site generator
- [TailwindCSS 4](https://tailwindcss.com) — styling
- [React 19](https://react.dev) — interactive islands only
- [Firebase](https://firebase.google.com) — Hosting, Auth, Firestore, Cloud Functions

## Getting started

Requires Node 22.15.0 and pnpm 10.11.0.

```sh
pnpm install
pnpm dev
```

The dev server runs at `http://localhost:4321`.

## Commands

| Command               | Action                               |
| --------------------- | ------------------------------------ |
| `pnpm dev`            | Dev server at `localhost:4321`       |
| `pnpm build`          | Production build into `./dist/`      |
| `pnpm preview`        | Preview the build                    |
| `pnpm lint`           | Run ESLint                           |
| `pnpm format`         | Format with Prettier                 |
| `pnpm test`           | Unit tests (Vitest)                  |
| `pnpm test:functions` | Cloud Functions tests                |
| `pnpm test:rules`     | Firestore rules against the emulator |
| `pnpm test:all`       | All three suites                     |

## Layout

```plaintext
src/
├── components/       # Astro components; react/ holds the client-side islands
├── layouts/          # Page layouts
├── loaders/          # Content loaders for gdg-ica-data
├── pages/            # File-based routing
├── lib/              # Firebase client, auth, API wrapper, permissions
└── content.config.ts # Zod schemas for the collections
functions/            # Cloud Functions API
docs/                 # Operational guides
```

Architecture notes, the admin permission model and the testing setup are documented in [CLAUDE.md](CLAUDE.md).

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to Firebase on every push to `main`, and on a `repository_dispatch` from the data repo so content updates rebuild the site.

## Contributing

Branch off `main`, commit with [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`), then open a pull request. PRs need at least one approval — keep them small and focused, and include screenshots for visual changes. Check the open issues and PRs first to avoid duplicate work.

Conventions: camelCase for variables and functions, PascalCase for components, Tailwind over custom CSS, no `!important`, no `console.log` in production code. Discuss new dependencies before adding them.

## License

MIT — see [LICENSE.md](LICENSE.md)

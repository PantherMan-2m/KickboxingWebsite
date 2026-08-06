# Handover — Kickboxing Website

**As of 2026-08-06.** This file is current-state-only — session-to-session continuity
notes, not a history. For how a specific decision or bug was found, see the relevant
`reports/phase-N-completion.md` (an archive — read only to spot-check a named claim,
never as standing reading; see `PLAN.md`'s "Keeping sessions cheap").

## Read this first

- **`public/docs/coach-student-system.md`** — usage guide (plain English).
- **`public/docs/coach-student-system-technical.md`** — schema, endpoints, security
  mechanics.
- **`plan/codebase-map.md`** — page inventory, middleware list, Pages Functions tree.
- **`PLAN.md`** + the current phase's `plan/phase-N.md` — what to build next.

## Current state

- **`main`** is at Phase 0 (`9582248`) — foundation: Node 24/Wrangler 4, migration
  tracking, backups, local dev environment (`npm run dev`, `npm run db:reset`), automated
  test suite (`npm test`), `/docs/*` gated behind a coach session.
- **`phase-1-shared-frontend`** is built and reviewed, **not yet merged** — shared
  `public/app.js` (nav/hamburger/logout/`escapeHtml`/`#year`/`fetchJson`, loaded on all 12
  pages), the three navigation dead-ends fixed (`/api/auth/session`, "Home" links,
  `coach/session.html`'s back link), and a post-review fix pass. Full evidence in
  `reports/phase-1-completion.md`. Merge command, once confirmed:
  ```bash
  git checkout main && git merge phase-1-shared-frontend && git push origin main
  ```
- Phase 2 is next after that merge — see `plan/phase-2.md`.

## Repo layout

- **Git repo root is the outer project folder**, not `public/` (moved in `f0c3ec8`,
  Phase 0). The deployed site is `public/`; Cloudflare Pages' **Root directory** setting
  is `public` — this is what makes Functions still resolve correctly under this layout.
- Tracked: `package.json`, `package-lock.json`, `Server.js`, `bootstrap-user.js`,
  `scripts/`, `test/`, `reports/`, `plan/`, `PLAN.md`, `HANDOVER.md`, `TODO.md`, and
  `public/**`.
- Untracked, by `.gitignore` at the root: `node_modules/`, `.wrangler/`, and
  **`backups/`** — production D1 exports with real user data including pbkdf2 password
  hashes. **Never let `backups/` be staged.**
- Remote: `https://github.com/PantherMan-2m/KickboxingWebsite.git`, branch `main`.
- `stable-phase3` (`44edd13`) is the pre-Phase-0 rollback point. It has the *old* repo
  layout, so reverting to it also means clearing the Cloudflare Root directory setting.
  The faster rollback is Pages deployment history (promote a previous build), no git
  involved.
- **Preview deployments bind to production D1.** Fine for read-only checks (e.g. login);
  never test writes against a preview. Use `npm run dev` for that.

## Working conventions

- **Opus plans; Sonnet executes.** Opus sessions: `PLAN.md`, checkpoint review, triaging
  findings, task specs. Sonnet sessions: everything else. See `PLAN.md`'s "Execution
  model".
- **Each phase gets its own feature branch** (`phase-0-foundation`, `phase-1-shared-frontend`,
  etc.), reviewed before merging (a fresh, independent Sonnet reviewer session by
  default; `/code-review ultra` reserved for Phases 4/7/8 — see `PLAN.md`'s "Review
  policy"), merged to `main` as a unit at the end of the phase.
- **Version-stamp every cacheable static asset** (`styles.css?v=`, `app.js?v=`) and bump
  it on every change, on every page that references it — see `PLAN.md` rule 6.

## Local development environment

- `npm run dev` (outer folder) — full local environment, Pages Functions + local D1.
- `npm run db:reset` (outer folder) — wipe/re-migrate/seed the local D1 with
  deterministic test data.
- `npm test` (outer folder) — full automated suite against that same local environment.
- `npm run dev:lan` — the old `Server.js` Express static server, LAN preview only, no
  Functions/D1.
- No live-reload on any of these — edit, save, then manually refresh.
- Full setup detail, seeded accounts, and non-obvious gotchas:
  `coach-student-system-technical.md`'s "Local development environment" and "Automated
  tests" sections.

## What's still open

- RSVPs only cover the recurring weekly schedule, not one-off/extra sessions. Low
  priority to extend unless it comes up.
- No self-service "forgot password" flow — coach/admin resets manually via SQL (Phase 7).
- No IP-based rate limiting on login, only the per-account 5-attempt/15-minute lockout
  (Phase 7, before Phase 8 opens the first unauthenticated write endpoint).
- `coach/attendance.html`'s `todayLocalIso()` uses the browser's timezone, a third notion
  of "today" alongside the server's SAST-fixed `todayIso()`. Deferred to Phase 2's T2.3.
- Full list, including low-priority cosmetic items, in `TODO.md`.

## Suggested opening prompt for a new chat

> Read PLAN.md, the current phase's plan/phase-N.md, and plan/codebase-map.md in this
> folder, then continue with the next incomplete task.

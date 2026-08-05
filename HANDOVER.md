# Handover — Kickboxing Website (as of 2026-08-05, Phase 0 + Phase 1 — MERGED to `main`)

## Read this first
For anything about how the coach/student login + attendance system actually works (both
plain-English usage and technical/schema/endpoint details), read
**`public/docs/coach-student-system.md`** — that's the living reference, not this file.
This file is session-to-session continuity notes only.

For the detailed evidence behind everything Phase 0 changed (exit conditions +
actual command output per task), see **`reports/phase-0-completion.md`** (outer folder).

## Repo layout — CHANGED 2026-08-05, the old gotcha is gone
- **The git repo root is now this outer folder**, not `public/`. Moved in `f0c3ec8` on
  branch `chore/git-root`, because Phase 0's deliverable (`scripts/`, `test/`, `reports/`,
  `package.json`) lived outside the repo and therefore existed on one disk with no backup,
  while nine phases depend on it.
- Now **tracked**: `package.json`, `package-lock.json`, `Server.js`, `bootstrap-user.js`,
  `scripts/`, `test/`, `reports/`, `PLAN.md`, `HANDOVER.md`, `TODO.md`, and `public/**`.
- Still **untracked**, by `.gitignore` at the new root: `node_modules/`, `.wrangler/`, and
  **`backups/`** — production D1 exports containing real user data including pbkdf2 password
  hashes. This folder used to be safe by construction (outside the repo); it is now inside
  the repo root and protected only by that ignore rule. **Never let it be staged.**
- **Cloudflare Pages: Root directory = `public`** in the project's build settings. This is
  what makes the move work — Pages requires `functions/` at the *project* root and explicitly
  not inside the static output root, so setting *build output directory* instead would serve
  the HTML fine while silently dropping every Function and `_middleware.js`. Verified on a
  preview deployment: login succeeded, so Functions are found under this layout.
- Remote: `https://github.com/PantherMan-2m/KickboxingWebsite.git`, branch `main`.
- **Rollback is now two actions**, not one: `stable-phase3` (`44edd13`) has the *old* layout,
  so reverting to it also requires clearing the Cloudflare Root directory setting. The faster
  path is unchanged — Pages deployment history, promote a previous build, no git involved.
- **Preview deployments bind to production D1.** Fine for read-only checks like login; never
  test writes against a preview. Use `npm run dev` (T0.5's local environment) for that.

## Working convention (adopted 2026-08-05)
Opus sessions are **planning only** — `PLAN.md`, checkpoint review, triaging review findings,
verifying claims against the code, writing task specs. Sonnet sessions execute everything
else. See `PLAN.md`'s "Execution model" section.

## What happened this session (2026-08-05, Phase 0: foundation) — DONE, merged to `main`
Built and verified Phase 0 of `PLAN.md` — the infrastructure every later phase depends on,
none of it user-visible. T0.1–T0.8 all done, merged to `main` as a fast-forward (`9582248`),
and T0.7's post-deploy live-Functions smoke test passed against the live site. Full
per-task exit-condition evidence is in `reports/phase-0-completion.md`; short version:

- **T0.1**: tagged `stable-phase3` (local + pushed) as the pre-Phase-0 rollback point.
- **T0.2**: dropped the `wrangler@3` pin (Node is now v24.19.0, Wrangler 4.118.0 works
  directly); fixed a stale global npm install that was shadowing Node 24's bundled npm.
- **T0.3**: production D1 backed up to `backups/` (outer folder, gitignored, contains
  real user data — never commit it); backup procedure documented as a standing
  "export before every migration" rule.
- **T0.4**: adopted `wrangler d1 migrations` tracking (`migrations_dir` in
  `wrangler.jsonc`) and reconciled production's `d1_migrations` table to record
  `0001_initial.sql`/`0002_session_rsvps.sql` as already applied, without re-running them.
- **T0.5**: full local dev environment — `npm run dev` runs Pages Functions against a
  real local D1 (`wrangler pages dev`), `npm run db:reset` wipes/re-migrates/seeds it with
  deterministic test data. This replaces testing against production with disposable
  accounts, which was the norm through Phase 1–3. Found and documented a genuinely
  non-obvious `wrangler pages dev` D1-binding gotcha — see
  `coach-student-system.md`'s "Local development environment" section before touching
  `scripts/dev-server.js` or `test/helpers/server.mjs`.
- **T0.6**: automated test suite (`npm test`, Node's built-in test runner, zero new
  dependencies, 36 tests). Fixed two real bugs with regression tests written
  failing-first: `todayIso()` used the Worker's UTC clock instead of SAST (the gym is in
  Somerset West, UTC+2 fixed offset, no DST), and `POST /api/student/rsvp` didn't
  validate the RSVP date's day-of-week or the 7-day window. Bonus fix along the way:
  `isValidDate` silently accepted invalid calendar dates like Feb 30.
- **T0.8**: `public/docs/coach-student-system.md` was being served publicly at
  `cjnacademy.com/docs/...` — now gated behind a coach session via
  `functions/docs/_middleware.js`, same pattern as the existing coach-page middleware.
- **Post-review fixes, round 1** (before merge): an independent review of the branch
  found the RSVP day-of-week/window validation from T0.6 also blocked *cancelling* a
  non-conforming RSVP (fixed: it now applies to creation only), a `null` JSON body
  crashing `rsvp.js` with a 500 (fixed: null-guarded), and that the pending-account login
  test used an unguessable password and so couldn't actually prove the pending-status gate
  worked (fixed: known password). Also extracted `scripts/lib/devEnv.js` so the D1-binding
  lookup and wrangler-spawning logic live in one place instead of three independently
  drifting copies, and dropped `shell:true` in favour of an argv array spawned via
  `cmd.exe` on Windows — **this round's fix was itself found broken at the next
  checkpoint, see below**.
- **Post-review fixes, round 2** (same day, before merge): a second independent review
  caught that round 1's "closes off the quoting bug class" claim was false — `cmd.exe`
  reparses its own command tail regardless of Node's argv quoting, confirmed empirically
  with `A&echo` still executing `echo`. Real fix: `wrangler` is now an outer-folder
  devDependency, spawned directly as `node <wrangler.js> <args>` — no shell anywhere, on
  either platform. Also pushed the branch to `origin` (it had no upstream — Phase 0 existed
  on one disk until this point), migrated the one remaining `shell:true` call site
  (`rsvp.test.mjs`'s direct-SQL regression test) to the new pattern, and corrected a
  factual error in `reports/phase-0-completion.md` (it had claimed T0.1–T0.4 landed on
  `main` directly; `main` was never touched — see that report for what actually happened).
  Full detail, including what's still open from this round, in
  `reports/phase-0-completion.md`.
- **Post-review triage, round 3** (same day, before merge): the second `/code-review
  ultra` pass's remaining 11 findings were triaged in full per `PLAN.md`'s four-bucket
  rule (`reports/phase-0-review-triage.md`), then the fix-now bucket was completed:
  `getD1Config()` now also returns `database_name`, replacing the three remaining
  hardcoded `'cjn-academy'` literals in local tooling (`db-reset-seed.js`,
  `rsvp.test.mjs`) — binding name deliberately not substituted, since `d1 migrations
  apply`'s handling of a binding argument was never verified; `getD1Config()` now throws
  if `wrangler.jsonc` ever has more than one `d1_databases` entry; the test suite imports
  `RSVP_WINDOW_DAYS` instead of hardcoding `7`, and its duplicated date-search loop was
  folded into one file-local helper; a new test pins `rsvp.js`'s deliberate
  400-before-404 validation order; and a comment now documents why `TEST_PORT=0` is
  unsupported. `resetAndSeed()`'s per-test-file process spawn was re-flagged and deferred
  again, logged in `TODO.md`. Suite is now 37/37. Full file:line detail in
  `reports/phase-0-completion.md`'s "Round 3" section.
- **Round 4 — git-root restructure and merge** (same day): moved the git repo root from
  `public/` to this outer folder on branch `chore/git-root` (see "Repo layout" above), then
  merged to `main` as a fast-forward: `git checkout main && git merge chore/git-root && git
  push origin main` → `Updating 44edd13..9582248, Fast-forward`. `stable-phase3` reconfirmed
  unchanged at `44edd13` after. T0.7's post-deploy live-Functions smoke test then ran against
  `cjnacademy.com` (not a preview): unauthenticated `GET /coach/dashboard.html` and
  `GET /docs/coach-student-system.md` both `302` to `/login.html` (`cf-cache-status: DYNAMIC`
  on both, confirming live Function responses, not a cached pre-Phase-0 static file); a real
  login and the `/coach/students.html` roster load were confirmed manually against the live
  site. All four checks pass — full detail in `reports/phase-0-completion.md`'s "Round 4"
  section. `phase-0-foundation` and `chore/git-root` deleted (local + remote) after
  confirming `main` contains every commit from both.

**Testing approach**: everything above was verified against the new **local** environment
(T0.5), not production — the whole point of Phase 0 was to stop needing disposable
production test accounts for this kind of change. Production was only touched for the
explicitly `[HUMAN GATE]` steps (T0.2's version-check query, T0.3's backup, T0.4's
migration-table reconciliation), each confirmed before running.

## What happened this session (2026-08-05, Phase 1: shared frontend + navigation) — DONE, merged to `main`
Built on branch `phase-1-shared-frontend`, T1.1 → T1.2 → T1.3 in order. Full per-task
evidence, including the required 12-page browser console capture, is in
`reports/phase-1-completion.md`; short version:

- **T1.1**: extracted nav/hamburger, logout, `escapeHtml`, the `#year` stamp, and a
  `fetchJson` wrapper into `public/app.js`, loaded via a versioned, deferred `<script>` tag
  on all 12 pages. Deleted the now-duplicate copy from every page and from
  `script.js:1-33` (script.js keeps only the contact-form handler and the homepage-only
  header-hide-on-scroll effect). Net **-253 lines**. Added a grep-shaped regression test
  (`test/unit/shared-frontend.test.mjs`) asserting all 12 pages reference `/app.js?v=` and
  have no leftover duplicated code — confirmed to actually fail when `app.js` is removed
  from a page, not just execute.
  **Real bug caught by the required browser-driven verification** (not by any console
  error): 7 of the 12 pages called their data-loading function synchronously at the bottom
  of their trailing inline `<script>`, which runs *during* document parsing — before
  `app.js`'s `defer`red execution actually completes, since `defer` only guarantees
  "before `DOMContentLoaded`," not "before a script already in the document." This threw a
  silent, uncaught-in-promise `ReferenceError` (no console output at all) and left those
  pages permanently stuck on "Loading…" on first load. This directly contradicts what this
  task was originally told about `defer`'s ordering guarantees — see
  `reports/phase-1-completion.md` for the full discrepancy writeup. Fixed by deferring each
  affected page's init call to `DOMContentLoaded`, which fires only after every deferred
  script (`app.js` included) has run.
- **T1.2**: fixed three navigation dead ends. Every authenticated page's nav now has an
  explicit "Home" link to `/` (the `.logo` already pointed there but wasn't an obvious nav
  item). New public `GET /api/auth/session` endpoint (`{ok:true, user:{name,role}}` or
  `{ok:true, user:null}` — always `200`, never a `401`/redirect) lets the homepage swap
  "Login" for "My dashboard" once logged in; response fields whitelisted explicitly, not
  spread, so `id`/`email`/`mustChangePassword` never leak. `coach/session.html` now has a
  back link to `coach/attendance.html`, upgraded to `?date=<session date>` once the session
  loads, so the coach lands back on the date they came from; `attendance.html` reads and
  validates that param (rejecting a malformed or calendar-impossible value like
  `2026-02-30`, falling back to today).
- **T1.3**: fixed five pre-existing stale claims in `coach-student-system.md` found during
  the doc pass (git repo root, `test/` tracked status, `npx wrangler` scope, middleware
  count, status line), rewrote "Frontend notes" and "Shared code" for `app.js`, added
  `/api/auth/session` to the API reference. Logged (not fixed) a third notion of "today" —
  `attendance.html`'s `todayLocalIso()` uses the **browser's** timezone, disagreeing with
  the server's SAST-fixed `todayIso()` for a coach travelling or on a VPN — to `TODO.md`,
  deferred to Phase 2's T2.3 which builds directly on "today" for the coach dashboard.

## What's still open
- RSVPs only cover the recurring weekly schedule, not one-off/extra sessions (no
  `class_templates` row to key an RSVP off of). Low priority to extend unless it comes up.
- No self-service "forgot password" flow — coach/admin resets manually via SQL.
- No IP-based rate limiting on login, only the per-account 5-attempt/15-minute lockout.
  Fine at gym scale, revisit if abuse shows up (Phase 7 addresses this before Phase 8
  opens the first unauthenticated write endpoint).
- Minor, pre-existing: homepage "Visit Us" card still shows `cnedlox@gmail.com` as
  static text (cosmetic only); Instagram link still a placeholder.

## Local development environment (Phase 0)
- `npm run dev` (from this outer folder) starts a full local environment — Pages
  Functions + a local D1 database — via `wrangler pages dev`, replacing the old
  production-only testing approach. `npm run db:reset` wipes and reseeds the local D1
  with deterministic test data. See `public/docs/coach-student-system.md`'s "Local
  development environment" section for the full setup and the non-obvious `wrangler pages
  dev` D1-binding gotcha worth reading before touching those scripts.
- `npm test` runs the automated suite against that same local environment — see
  `coach-student-system.md`'s "Automated tests" section for coverage and the reserved
  seeded accounts you should never log into manually (the suite mutates their state on
  purpose).
- The old `Server.js` Express static server (LAN preview, no Functions/D1) still exists,
  now under `npm run dev:lan`, for previewing on a phone/other device on the network.
- No live-reload on any of these — edit, save, then manually refresh.

## Internal docs access (Phase 0, T0.8)
`public/docs/coach-student-system.md` used to be served publicly (it's inside the
deployed directory). It's now gated behind a coach session via
`public/functions/docs/_middleware.js` (same pattern as `functions/coach/_middleware.js`):
no session → redirect to `/login.html`; logged in as a student → redirect to
`/student/dashboard.html`; logged in as a coach → serves the document normally. Still
tracked by git and version-controlled as before — only public visibility changed.

## Branch convention
**Changed in Phase 0 (T0.7).** Phases 1–3 pushed each stage directly to `main`, since each
change was small and independently deploy-verified. From Phase 0 on, each phase gets its
own feature branch (`phase-0-foundation`, `phase-1-shared-frontend`, etc.), reviewed
(`/code-review ultra` before merging) and merged to `main` as a unit at the end of the
phase, rather than mid-phase. Rationale in `PLAN.md`'s "How to use this document" section.

## Suggested opening prompt for a new chat
> Read PLAN.md, HANDOVER.md, and public/docs/coach-student-system.md in this folder,
> then continue with the next incomplete task in PLAN.md's phase map.

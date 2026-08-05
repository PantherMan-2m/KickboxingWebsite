# TODO

## Coach/student login + attendance: Phase 1 + 2 + 3 all done
Full details (usage + technical reference) now live in
**`public/docs/coach-student-system.md`** — don't duplicate that content here. Quick
status:

1. **Real coach account exists** (`matthews.giovanni@gmail.com`) — bootstrapped this
   session. Students can request their own accounts now (Phase 2), and RSVP to upcoming
   classes (Phase 3).
2. RSVPs only cover the recurring weekly schedule, not one-off/extra sessions (no
   `class_templates` row to key an RSVP off of). Low priority to extend.
3. No self-service "forgot password" — coach/admin resets manually via SQL (command in
   `public/docs/coach-student-system.md`).
4. No IP-based rate limiting on login, only the per-account 5-attempt/15-minute lockout.
   Fine at gym scale, revisit if abuse shows up.

## Phase 0 (foundation) — done and merged to `main`, see `reports/phase-0-completion.md`
Built on branch `phase-0-foundation`, then `chore/git-root` (the repo restructure below),
merged to `main` as a fast-forward (`9582248`) on 2026-08-05. T0.7's post-deploy
live-Functions smoke test passed against the live site. Per-task exit-condition evidence
in `reports/phase-0-completion.md`. Summary:
- `stable-phase3` tag marks the pre-Phase-0 rollback point (local + pushed to origin).
- Node upgraded to v24.19.0; the old Wrangler 3 pin dropped for unpinned `wrangler`
  (4.118.0). Stale global npm (9.8.1, shadowing Node 24's bundled 11.17.0 via a leftover
  install at `%APPDATA%\npm\node_modules\npm`) fixed with `npm install -g npm@latest`.
- Production D1 backed up (`backups/cjn-academy-<date>.sql`, outer folder, gitignored)
  and migration tracking adopted (`migrations_dir` in `wrangler.jsonc`, production's
  `d1_migrations` table reconciled to record `0001`/`0002` as already applied without
  re-running them).
- Full local dev environment: `npm run dev` (Pages Functions + local D1 via
  `wrangler pages dev`) and `npm run db:reset` (wipe/re-migrate/seed, deterministic test
  data). Non-obvious gotcha documented in `coach-student-system.md`: `wrangler pages dev`
  needs `--d1=DB=<database_id>` (not the database *name*) to bind to the same local D1
  the migration/seed commands use.
- Automated test suite (`npm test`, Node's built-in test runner, 37 tests): unit tests for
  date helpers + password hashing, integration tests for login/lockout/all 4
  route-protection middlewares (now 5, including `/docs/*`)/RSVP.
- Two real bugs fixed with regression tests written failing-first: `todayIso()` used UTC
  instead of SAST (gym is in Somerset West, UTC+2 fixed offset), causing a ~2-hour daily
  window where "today" was wrong; `POST /api/student/rsvp` didn't validate the RSVP
  date's day-of-week or the 7-day window, so a crafted request could write nonsense RSVP
  data. Bonus fix found along the way: `isValidDate` accepted invalid calendar dates like
  Feb 30 (`Date` silently normalizes overflow instead of erroring).
- `public/docs/coach-student-system.md` no longer served publicly — gated behind a coach
  session via `functions/docs/_middleware.js`.
- Four rounds of review/follow-up on the branch (2026-08-05, same day) found and fixed real
  problems the process that built the code didn't catch itself: round 1 fixed RSVP
  cancellation being blocked by create-time validation, a `null` JSON body crashing
  `rsvp.js` with a 500, and a login test that couldn't actually prove what it claimed.
  Round 2 caught that round 1's *own fix* for a shell-quoting bug was itself wrong (a
  "closes off the whole bug class" claim that shipped false into three places) — the real
  fix adds `wrangler` as a devDependency (see `devDependencies` in `package.json`, resolved
  via `node_modules/wrangler`) and invokes it directly via `node` instead of through
  `npx`/a shell, pinning the version as a side effect. Round 2 also pushed the branch to
  `origin` (it had no upstream) and fixed a factual error in the completion report. Round 3
  triaged the remaining 11 second-pass `/code-review ultra` findings
  (`reports/phase-0-review-triage.md`) and fixed the ones ranked real-and-in-scope: `7`
  hardcoded database names replaced with a shared `getD1Config()` lookup, a guard against
  more than one `d1_databases` entry, a de-duplicated test helper, and a test pinning
  `rsvp.js`'s deliberate 400-before-404 validation order (suite now 37 tests). Round 4
  moved the git repo root from `public/` to this outer folder (`chore/git-root`) so
  `scripts/`, `test/`, `reports/`, and `package.json` became version-controlled instead of
  living untracked on one machine, then merged everything to `main` and passed T0.7's
  live-Functions smoke test on the deployed site. Full findings and triage in
  `reports/phase-0-completion.md`. Some items were logged rather than fixed, below.

### Logged, not fixed (from the 2026-08-05 code review)
- **Systemic**: every Pages Function handler that does `body.foo` or destructures a
  parsed JSON body right after `context.request.json()` — 10 more files beyond the one
  fixed in `rsvp.js` (`api/coach/sessions.js`, `api/coach/requests/[id].js`,
  `api/auth/request-account.js`, `api/coach/mark-attendance.js`,
  `api/coach/templates/[id].js`, `api/coach/templates.js`, `api/coach/students/[id].js`,
  `api/coach/students.js`, `api/auth/change-password.js`, `api/auth/login.js`) — will
  throw an uncaught `TypeError` and return a bare 500 instead of a graceful 400 if the
  request body is a literal JSON `null` (valid JSON, not a `.json()` parse error, so the
  existing `try/catch` around the parse doesn't catch it). Only `rsvp.js` was fixed, since
  that's the one file this session's diff actually touched. Worth a small shared
  `parseJsonBody(context)` helper (parse + null/type guard in one place) next time any of
  these files is touched, rather than patching all 11 in one pass now.
- **`test/helpers/server.mjs`'s `resetAndSeed()`** (`test/helpers/server.mjs:41`) shells
  out to a whole separate `node scripts/db-reset-seed.js` process instead of importing
  and calling that logic in-process — pays a full Node bootstrap on every integration
  test file's setup (4 files × 1 extra process each). Re-flagged a third time at the
  Phase 0 second-pass review ("the reason it was deferred last round no longer applies,
  `devEnv.js` exists now") and triaged again as defer: making it in-process requires
  `db-reset-seed.js` to become importable, which opens the door to state leaking between
  test files — a worse failure mode than a slow suite, on a branch whose whole purpose is
  a trustworthy safety net. The suite is ~65s. Revisit when that becomes painful, not
  before.

## Phase 1 (shared frontend + navigation) — done and merged to `main`, see `reports/phase-1-completion.md`
Built on branch `phase-1-shared-frontend`. `public/app.js` now owns nav/hamburger, logout,
`escapeHtml`, the `#year` stamp, and a `fetchJson` wrapper, shared by all 12 pages (net
-253 lines); `script.js` keeps only the contact-form handler and the homepage-only
header-hide-on-scroll effect. Every authenticated page's nav now has an explicit "Home"
link; the homepage swaps "Login" for "My dashboard" via the new public
`GET /api/auth/session` endpoint; `coach/session.html` has a back link to
`coach/attendance.html?date=...` that preserves the selected date. Full evidence,
including the 12-page browser console capture, in `reports/phase-1-completion.md`.

**Logged, not fixed (found during T1.3's doc pass)**: `coach/attendance.html`'s
`todayLocalIso()` computes "today" from the **browser's** local timezone — a third notion
of "today" alongside the server's SAST-fixed `todayIso()` (`_utils/dates.js`, fixed in
T0.6b) and the plain UTC `new Date()` that would apply anywhere else untouched. The two
agree for a coach physically in South Africa and disagree for one travelling or on a VPN.
Not fixed here — Phase 2's next-class panel (T2.3) builds directly on "today" for the
coach dashboard and is where this should be resolved, per `PLAN.md`'s Phase 1 section.

## Contact form: Resend wired up and confirmed working (done)
`RESEND_API_KEY` is set in Cloudflare Pages (Production + Preview), the `cjnacademy.com`
sending domain is verified, and the form sends to `info@cjnacademy.com` (which
Cloudflare Email Routing forwards to Protonmail). Confirmed end-to-end by the user.

## Repo structure — RESOLVED 2026-08-05, superseding the note that used to be here
This section previously said only `functions/api/contact.js` was moved into
`public/functions/` and that moving the whole git root was rejected, on the reasoning that
Cloudflare Pages looks for `functions/` at the root of whatever it deploys. That reasoning
was correct but incomplete — Pages' **Root directory** build setting is exactly the knob
that resolves it, and Phase 0's checkpoint review flagged the untracked-tooling cost of the
old setup as no longer acceptable once a test suite became load-bearing for nine remaining
phases (see `reports/phase-0-checkpoint-review.md`, "Pending decision" item 5).

Resolved by moving the git root from `public/` to this outer folder (`chore/git-root`,
merged to `main` in `9582248`), with Cloudflare Pages' Root directory set to `public`.
`Server.js`, `package.json`, `package-lock.json`, `bootstrap-user.js`, `scripts/`, `test/`,
`reports/`, `PLAN.md`, `HANDOVER.md`, and `TODO.md` are now all tracked. Still untracked,
by `.gitignore` at the new root: `node_modules/`, `.wrangler/`, and `backups/` (production
D1 exports with real password hashes — **never let this be staged**). See
`HANDOVER.md`'s "Repo layout" section for the full current state, including the two-step
rollback this creates (`stable-phase3` has the *old* layout).

## Low priority / nice-to-have
- Instagram social link is still a placeholder (`href="#"`) — no URL provided yet.
- Two coach photo filenames still contain spaces (`Cristiano marketing.png`, `Giovanni marketing
  PM.png`) — works fine, not URL-safe, worth renaming eventually.
- `images/Logo.jpg` is unused now that `index.html` references `Logo.png` (kept "for reference" per
  the logo-update commit) — fine to remove later if it's confirmed dead.
- No Open Graph / social-card meta tags yet for rich link previews.
- Homepage "Visit Us" card still shows `cnedlox@gmail.com` as static text — cosmetic
  only, the contact form itself correctly sends to `info@cjnacademy.com`.

## Recently completed (for context — trim this section next time it gets stale)
- Coach/student login system (Phase 1) built, deployed, and verified live against
  production, plus a frontend bugfix pass (nav contrast, dark-mode form controls,
  mobile hamburger menu, stylesheet cache-busting) after real-world testing surfaced
  issues. Full details in `public/docs/coach-student-system.md`. (2026-08-04)
- Phase 2 (self-signup + coach approval) built and deployed: public
  `request-account.html` form, `coach/requests.html` admin screen to approve (creates
  the account + emails a temp password) or reject (deletes the row). Full details in
  `public/docs/coach-student-system.md`. (2026-08-04)
- Phase 3 (class RSVPs) built and deployed: `student/upcoming.html` lets students RSVP
  "going" to the next 7 days of weekly-template classes; `coach/session.html` shows an
  RSVP column alongside attendance-marking. New `session_rsvps` table, keyed to
  template+date rather than an actual session row. Full details in
  `public/docs/coach-student-system.md`. (2026-08-04)
- WhatsApp floating button, live Facebook/WhatsApp social links, WhatsApp number mismatch fixed.
- Copy typos, schedule-text mismatch, meta description mismatch, README hosting/contact-form accuracy.
- Duplicate `.gallery img` CSS rule removed, 5 unreferenced images deleted.
- `functions/api/contact.js` moved into the repo so it deploys with Cloudflare Pages.

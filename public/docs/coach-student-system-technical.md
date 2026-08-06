# Coach/Student Login & Attendance System — Technical Reference

Schema, endpoints, and security mechanics, for whoever (human or AI) needs to modify the
code later. For plain-English usage, see **`coach-student-system.md`** in this same folder.

---

## Stack

Cloudflare Pages (static site + Functions) + **D1** (managed SQLite), no build step, no
npm dependencies bundled into the deployed site — everything uses what's natively
available in the Workers runtime (Web Crypto API, `crypto.randomUUID()`).

Git repo root is the outer project folder, not `public/` (moved in `f0c3ec8`, Phase 0 —
see main `HANDOVER.md` for the full repo-structure history). The deployed site is still
`public/`, and Cloudflare Pages' **Root directory** setting is `public` to compensate.
`wrangler.jsonc` (at `public/wrangler.jsonc`) declares the `DB` binding's `database_name`/`database_id`
or migration tracking (`wrangler d1 migrations`/`d1 execute`); the *production* binding is
set via the Cloudflare Pages dashboard (Settings → Bindings), not read from `wrangler.jsonc`
for the live Git-integrated deploy. **`wrangler pages dev` does NOT auto-bind D1 from this
config** — see "Local development environment" below for the (non-obvious) reason and fix.

## Local development environment

`npm run dev` (from the **outer** project folder, not `public/`) starts
`wrangler pages dev`, serving `public/` with Functions and a **local** D1 database bound as
`DB` — the environment every phase from here on is verified against, replacing the old
approach of testing against production with disposable accounts.

`npm run db:reset` (also from the outer folder) wipes the local D1 entirely, re-applies
every migration from scratch, and loads deterministic seed data: two coaches
(`coach@seed.test` / `CoachPass123!`, and `coachmustchange@seed.test` reserved for the
coach-side must-change-password route-protection test), and six students covering every
status the app cares about — two `active`, one `inactive`, one `pending` (`pending1@seed.test`
/ `PendingPass123!` — deliberately a **known** password, unlike the real request-account
flow, so a test can prove login is blocked by `status='pending'` itself and not just by an
unknown password), one `active` with `must_change_password` set, and one `active` reserved
exclusively for the automated lockout test (`lockout1@seed.test` — never log in as this
user manually, the test suite deliberately locks it) — plus four weekly class templates
(Mon/Wed/Fri active, Sat inactive, to prove the "active only" filter) and two historical
sessions with a mixed present/absent/excused attendance roster. Safe to run repeatedly;
each run starts from a clean slate, so it always produces the same eight users, four
templates, two sessions, and six attendance rows.

**Non-obvious gotcha, verified 2026-08-05 (wrangler 4.118.0), worth preserving**:
`wrangler pages dev` does not read `d1_databases` from `wrangler.jsonc` the way `wrangler
dev` (plain Workers) does — without an explicit `--d1` flag, `env.DB` is simply undefined
and every Functions handler that touches the database throws. Worse, `--d1=DB=cjn-academy`
(binding `=` the database **name**) silently creates a *different, empty* local D1 instance
than the one `wrangler d1 migrations apply --local` / `wrangler d1 execute --local` operate
on — those resolve the target database via `wrangler.jsonc`'s config, keyed off
`database_id`, not `database_name`. The fix, implemented once in `scripts/lib/devEnv.js`
(shared by `dev-server.js`, `db-reset-seed.js`, and `test/helpers/server.mjs` — an earlier
version had this duplicated three times, and one copy silently drifted by hardcoding the
binding name instead of reading it from config): pass `--d1=DB=<database_id>` (the UUID,
not the name) so all code paths resolve to the same underlying local `.sqlite` file under
`public/.wrangler/state/v3/d1/` (gitignored). Get this wrong and local dev looks broken in
a confusing way — D1 queries either throw `Cannot read properties of undefined` (no `--d1`
at all) or `no such table: users` (`--d1` present but pointed at the wrong, unmigrated
local database).

`devEnv.js` also exports `wranglerCommand()`/`runWrangler()`, which spawn wrangler as
`node <wrangler.js> <args>` directly — `wrangler` is a devDependency of the outer
`package.json` specifically so this path is resolvable and its version is pinned, instead
of `npx`'s "resolve whatever's cached or download latest" behavior. **No shell is ever
invoked, on any platform.** This replaces an earlier version that routed through `npx`
(`cmd.exe /d /s /c npx wrangler <args>` on Windows, since `npx` is a `.cmd` shim Node can't
exec directly without a shell) whose comment claimed avoiding `shell:true` "closes off the
whole class of shell-metacharacter bugs" — **that claim was false and shipped anyway**.
Verified empirically at a later review checkpoint: `spawnSync('cmd.exe', ['/d','/s','/c',
...args])` with an argument like `A&echo` still gets re-parsed by cmd.exe's own
command-tail interpreter and `echo` still runs, because Node's argv-array quoting protects
against the *target program's* standard argument parsing, not cmd.exe's own second-stage
reparsing of whatever follows `/c` — and Node only quotes an argument at all if it contains
whitespace/quotes, so a bare `&` or `|` sailed through unescaped. Invoking `node
<wrangler.js>` directly sidesteps the problem instead of trying to out-escape it: there is
no cmd.exe, no `/bin/sh`, anywhere in the process tree on any platform, so no argument
value gets reinterpreted regardless of what characters it contains — re-verified with the
same `A&echo`-style argument surviving intact through a real `wrangler d1 execute`
invocation. This also lets `test/helpers/server.mjs` spawn with `detached: true` on POSIX
so its process tree can actually be killed as a group afterward, and removes the need for
any hand-rolled command-line escaping anywhere in this project's dev tooling.

Scripts (all defined in the outer folder's `package.json`, run from there):
- `npm run dev` — start the full local environment (`scripts/dev-server.js`).
- `npm run db:reset` — wipe + re-migrate + seed the local D1 (`scripts/db-reset-seed.js`).
- `npm run dev:lan` — the old `Server.js` Express static server for LAN preview from a
  phone/other device on the network; does **not** serve Functions or D1, kept only for
  that narrower use case.

## Automated tests

`npm test` (outer folder) runs the full suite via Node 24's built-in test runner —
no new dependencies, nothing to bundle. Test files live in the outer folder's `test/`,
tracked by git along with `scripts/` (Phase 0's `f0c3ec8` moved the repo root so both
are now version-controlled; `Server.js` and `bootstrap-user.js` are also tracked):

- `test/unit/` — pure functions imported directly (`dates.js`, `auth.js`'s password
  hashing); no server needed, runs in milliseconds.
- `test/integration/` — real HTTP requests against a live `wrangler pages dev` instance on
  a **dedicated port (8799)**, separate from `npm run dev`'s 8788, so running the suite
  never fights a dev server you left open. Each integration test file resets+reseeds the
  local D1 and starts/stops its own server instance in `before`/`after` hooks
  (`test/helpers/server.mjs`) — this makes any single file runnable standalone
  (`node --test test/integration/rsvp.test.mjs`) for debugging, at the cost of the full
  suite needing serial file execution (`--test-concurrency=1`, already set in the `test`
  script) so two files' servers never collide on the same port. This is why the full
  suite takes ~2 minutes — each integration file pays its own ~5-10s server-startup cost.
  Coverage: login, lockout, all five route-protection middlewares, RSVP, and
  `/api/auth/session`.
- `test/helpers/auth.mjs` — the shared `login(email, password)` helper every integration
  test file uses; returns `{res, cookie}`, callers read the body themselves.
- `test/unit/shared-frontend.test.mjs` — grep-shaped check (T1.1) that all 12 pages
  reference `/app.js?v=` and have no leftover locally-duplicated nav/logout/`escapeHtml`/
  `#year` code.

**Reserved seeded accounts — never log into these manually**, the test suite mutates
their state on purpose: `lockout1@seed.test` (deliberately locked by the lockout test),
`coachmustchange@seed.test` / `mustchange1@seed.test` (used for must-change-password
redirect checks). `pending1@seed.test` has a known password *on purpose* (see the usage
guide) but is otherwise safe to reference — its account state is never mutated by a test.

Full before/after evidence for every regression test, and the bugs each one caught, lives
in `reports/phase-N-completion.md` (outer folder) — those are archives, read only when a
specific claim needs spot-checking, not standing reading.

## Migration tracking

`wrangler.jsonc` declares `migrations_dir: "migrations"` on the `DB` binding, so
`wrangler d1 migrations list/apply` (local and `--remote`) tracks applied migrations via
a `d1_migrations` table, instead of migrations being run by hand with `d1 execute`.

Any *new* migration should be created with `wrangler d1 migrations create cjn-academy
<name>` and applied with `wrangler d1 migrations apply cjn-academy --remote` (after a
fresh backup — see the usage guide's "Common maintenance tasks") — never with a raw
`d1 execute --file=...`, which wouldn't record itself in `d1_migrations`.

## Node/Wrangler requirement

This project requires Node 22+ (current: Node 24.19.0) to run unpinned `wrangler` (4.x).
The `wrangler d1`/`wrangler pages` commands documented in the usage guide's "Common
maintenance tasks" use plain `npx wrangler`. The local dev tooling (`npm run dev`,
`npm run db:reset`, and the test suite) deliberately does not — see "Local development
environment" above for why it spawns `wrangler` directly via `node <wrangler.js>` instead.

## Database schema

Full DDL lives in `migrations/0001_initial.sql` and `migrations/0002_session_rsvps.sql`.
Six tables:

- **`users`** — coaches and students both live here, distinguished by `role` ('coach'/
  'student'). `status` ('active'/'inactive'/'pending' — 'pending' is a self-signup
  request awaiting coach approval). `password_hash` format:
  `pbkdf2:sha256:<iterations>:<salt_b64>:<hash_b64>` — for a `pending` row this is a
  random placeholder nobody knows (login is already blocked for non-`active` accounts,
  so it's never actually reachable), overwritten with a real temp password on approval.
  `must_change_password` forces the change-password redirect. `failed_login_attempts` +
  `locked_until` implement the brute-force lockout.
- **`sessions`** — *login* sessions (cookie-backed), not class sessions. DB-backed
  (rather than a stateless signed cookie) specifically so logout/revocation is real and
  a coach could force-invalidate a session if needed.
- **`class_templates`** — the recurring weekly schedule (day-of-week + time + name).
- **`class_sessions`** — actual dated instances. `template_id` links back to a template
  if it was auto-suggested, or is `NULL` for a one-off (e.g. an extra Friday class). A
  partial unique index (`template_id, session_date`) prevents accidentally creating two
  sessions for the same template on the same date, while leaving one-offs unconstrained.
- **`attendance`** — one row per (session, student), written for the *entire* active
  roster when a coach saves (not just who was present) — this is what makes "did this
  student attend" and "reopen and amend" both simple queries instead of needing to infer
  absence from missing rows.
- **`session_rsvps`** — a student's "going" intent for an upcoming occurrence of a
  weekly class. Keyed to `(template_id, session_date, user_id)` rather than a
  `class_sessions` row, because a session usually doesn't exist yet at RSVP time (the
  coach creates it later via the Attendance page) — RSVPing is a pure read/write against
  the template + date, no session gets silently created as a side effect. Row existence
  = going; un-RSVPing deletes the row rather than tracking a "not going" state.
  Deliberately separate from `attendance`, since RSVP intent and actual attendance are
  different facts that can disagree (someone RSVPs then doesn't show, or shows without
  RSVPing). One-off sessions (`class_sessions.template_id IS NULL`) have no way to be
  RSVP'd to.

## Auth mechanics

- **Password hashing**: PBKDF2-SHA256 via `crypto.subtle`, 16-byte random salt per user,
  100,000 iterations. Iteration count is stored in the hash string itself, so it can be
  raised later without invalidating existing hashes.
- **Sessions**: `crypto.randomUUID()` token stored in `sessions.id`, set as the cookie
  value directly (`HttpOnly; Secure; SameSite=Lax; Path=/`, 14-day fixed TTL, no sliding
  renewal). No HMAC signing needed since the DB lookup is the source of truth.
- **Brute-force lockout**: 5 consecutive failed attempts locks the account for 15
  minutes (`users.failed_login_attempts` / `locked_until`). Resets to 0 on any
  successful login. All failure modes (no such user, wrong password, inactive, locked)
  return the identical generic `401 {ok:false, error:'Invalid email or password'}` to
  avoid leaking which case applied (user enumeration protection).
- **Route protection**: Cloudflare Pages Functions `_middleware.js`, which genuinely
  gates *static* HTML pages, not just API routes. Five middleware files:
  `functions/coach/_middleware.js` and `functions/student/_middleware.js` gate the
  static pages (redirect to `/login.html` if unauthenticated, redirect to the other
  role's dashboard if wrong role, redirect to `/change-password.html` if
  `must_change_password`); `functions/api/coach/_middleware.js` and
  `functions/api/student/_middleware.js` do the same for API routes but return JSON
  401/403 instead of redirecting; and `functions/docs/_middleware.js` (T0.8) gates
  `/docs/*`, coach-only. Each middleware stashes the resolved user on
  `context.data.user` so downstream handlers don't need a second session lookup.

## Shared code

- `functions/api/_utils/auth.js` — hashing, session CRUD, cookie helpers,
  `getSessionUser(context)`. Lives under an underscore-prefixed folder so Pages Functions
  excludes it from routing, but it's still a normal ES module importable by sibling
  handler files.
- `functions/api/_utils/email.js` — thin Resend wrapper, deliberately separate from the
  pre-existing `functions/api/contact.js` so that already-working file stays untouched.
- `functions/api/_utils/dates.js` — `isValidDate`, `dayOfWeekFor`, `todayIso`,
  `addDaysIso`, `RSVP_WINDOW_DAYS`. Used by both `coach/sessions.js` (matching a date to
  a weekly template) and `student/upcoming.js`/`student/rsvp.js` (the 7-day window).
- `public/app.js` (Phase 1, T1.1) — shared frontend behaviour: the nav/hamburger toggle,
  the logout handler, `escapeHtml`, the `#year` footer stamp, and a
  `fetchJson(url, options)` wrapper (`fetch` + `.json()` in one call, catching a network
  failure or non-JSON body and returning a synthetic `{ok:false, error}` instead of
  throwing). Every DOM lookup inside it is guarded — three pages (`login.html`,
  `change-password.html`, `request-account.html`) have a logo-only header with none of
  the nav/logout elements.

  **Load order, and why it matters**: `<script src="/app.js?v=1"></script>` (a plain
  script, *not* `defer`) is placed immediately before each page's own trailing inline
  `<script>` at the end of `<body>` — not in `<head>`. Both are ordinary blocking scripts,
  so the browser executes them strictly in document order: `app.js` always finishes before
  the page-specific script starts, guaranteeing `fetchJson`/`escapeHtml` are already
  defined. An earlier version of this file loaded `app.js` with `defer` in `<head>`, on
  the reasoning that `defer` executes "before each page's existing inline block" — that
  reasoning was backwards. Per the HTML spec, a `defer`red script only guarantees
  execution before `DOMContentLoaded`, which is *after* any ordinary inline `<script>`
  already in the document has run (those execute synchronously during parsing). Under
  that version, 7 pages that called their data-loading function immediately at the
  bottom of their trailing script referenced `fetchJson` before `app.js` had actually
  run, throwing a `ReferenceError` as an unhandled promise rejection with no visible
  console error — the page just stayed on "Loading…" forever. Full writeup in
  `reports/phase-1-completion.md` and `reports/phase-1-review.md`.

## API reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | public | `{email,password}` → session cookie |
| `/api/auth/logout` | POST | public (no-op if none) | revokes session, clears cookie |
| `/api/auth/change-password` | POST | any logged-in user | `{newPassword}`, clears `must_change_password` |
| `/api/auth/request-account` | POST | public | `{name,email}` → creates a `pending` user (silently no-ops if the email already exists); always returns the same generic success response |
| `/api/auth/session` | GET | public | session state for the homepage's Login/My-dashboard swap; always `200 {ok:true, user:{name,role}}` or `{ok:true, user:null}` — never a 401 or redirect, and never more than `name`+`role`. Sets `Cache-Control: private, no-store` (the response varies per session cookie). |
| `/api/coach/students` | GET/POST | coach | list roster / create student + email invite |
| `/api/coach/students/:id` | PATCH | coach | `{status}` activate/deactivate |
| `/api/coach/requests` | GET | coach | list `pending` users |
| `/api/coach/requests/:id` | PATCH | coach | `{action:'approve'|'reject'}` — approve activates + emails temp password; reject deletes the row |
| `/api/coach/templates` | GET/POST | coach | list/create recurring weekly classes |
| `/api/coach/templates/:id` | PATCH | coach | `{active}` toggle |
| `/api/coach/sessions?date=` | GET | coach | template suggestions + existing sessions for a date |
| `/api/coach/sessions` | POST | coach | create from template (idempotent) or one-off |
| `/api/coach/sessions/:id` | GET | coach | session detail + roster merged with existing attendance |
| `/api/coach/mark-attendance` | POST | coach | `{sessionId,records:[{userId,status}]}`, atomic via `D1Database.batch()` |
| `/api/student/attendance` | GET | student | own history only |
| `/api/student/upcoming` | GET | student | next 7 days of weekly-template classes, merged with own RSVPs |
| `/api/student/rsvp` | POST | student | `{templateId,date,going}` → insert/delete own `session_rsvps` row |

## Frontend notes

- No build step, no JS modules/bundler. Shared behaviour lives in `public/app.js` (see
  "Shared code" above), loaded on every page. Each page still has its own trailing inline
  `<script>` for page-specific logic (a form handler, a data-fetch-and-render loop).
  `script.js` is homepage-only, kept separate because it also owns the contact-form
  handler and the header-hide-on-scroll effect, neither of which belongs on the other 11
  pages.
- `.form` is a reusable CSS class (generalized from what was originally `#contactForm`-only
  styling) for any label/input/button form layout.
- `color-scheme: dark` is set globally (site is dark-only) so native controls (date
  picker icon, checkboxes) render dark-aware instead of near-invisible light-mode
  defaults.
- **Cache-busting**: every page's `styles.css` reference includes a version query string
  (`styles.css?v=4` as of this writing), and `app.js` likewise (`app.js?v=1`). **Bump the
  relevant number on every future change to that asset, on every page that references
  it** — Cloudflare serves the HTML itself with `max-age=0` (always fresh), but static
  assets get a 4-hour browser cache; without the version bump, visitors can keep seeing a
  stale asset for hours after a fix ships. This bit us twice during development before
  the versioning was added.
- Mobile nav (toggle button, `.nav-links.open` class, closes on link-click or scroll,
  locks body scroll while open) is one implementation in `app.js`, shared by all 12
  pages including the homepage. Every authenticated page's nav also has an explicit
  "Home" link back to `/`; the homepage swaps "Login" for "My dashboard" when
  `/api/auth/session` reports a logged-in visitor.
- Every new table (roster, weekly schedule, session roster, student history, upcoming
  classes) wraps in `.scroll-x` like the original schedule table, for mobile horizontal
  scrolling.

## What's deliberately not built yet

- RSVPs only cover the recurring weekly schedule, not one-off/extra sessions — those
  have no `class_templates` row to key an RSVP off of, and are typically announced and
  created by the coach same-day anyway. Low priority to extend unless it comes up.
- No self-service "forgot password" flow (coach/admin resets manually via SQL, see
  the usage guide's "Common maintenance tasks").
- No IP-based rate limiting on `/api/auth/login`, only the per-account lockout above.
  Fine at gym scale; revisit if abuse ever shows up.

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
for the live Git-integrated deploy (Phase 0 finding, unverified since). **This does not
generalize to plaintext environment variables/secrets** — T3.8 found that UI (Settings →
Environment variables) disabled for this project, config-file-managed instead; see
"Waitlist and notifications" below for the `wrangler pages secret put` workaround actually
used. **`wrangler pages dev` does NOT auto-bind D1 from this config** — see "Local
development environment" below for the (non-obvious) reason and fix.

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

Full DDL lives in `migrations/0001_initial.sql`, `migrations/0002_session_rsvps.sql`,
`migrations/0003_class_capacity.sql`, and `migrations/0004_rsvp_status.sql`. Six tables:

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
- **`class_templates`** — the recurring weekly schedule (day-of-week + time + name),
  plus `capacity` (INTEGER, nullable — `0003`). `NULL` means unlimited.
- **`class_sessions`** — actual dated instances. `template_id` links back to a template
  if it was auto-suggested, or is `NULL` for a one-off (e.g. an extra Friday class). A
  partial unique index (`template_id, session_date`) prevents accidentally creating two
  sessions for the same template on the same date, while leaving one-offs unconstrained.
  Also has `capacity` (INTEGER, nullable — `0003`), an optional per-date override.

  **Effective capacity resolution rule** (used by `templates/[id].js`'s effective view,
  `sessions/[id].js`'s GET, `student/rsvp.js`'s enforcement, `student/upcoming.js`'s
  per-row display, and `coach/next-class.js`): `COALESCE(class_sessions.capacity,
  class_templates.capacity)` for a given `template_id` + `session_date`. The
  `class_sessions` row may not exist yet (coaches often create it same-day, after
  students have already RSVP'd) — no row means "use the template's capacity" exactly
  like a row whose own `capacity` is `NULL`. A session's capacity column is **never
  copied** from the template at creation time, so a later template capacity change
  flows through to every session that hasn't set its own override.
- **`attendance`** — one row per (session, student), written for the *entire* active
  roster when a coach saves (not just who was present) — this is what makes "did this
  student attend" and "reopen and amend" both simple queries instead of needing to infer
  absence from missing rows.
- **`session_rsvps`** — a student's intent for an upcoming occurrence of a weekly class:
  `status` (`0004`, `TEXT NOT NULL DEFAULT 'going'`, validated in application code, no
  CHECK constraint) is `'going'` or `'waitlisted'` (Phase 3). Keyed to `(template_id,
  session_date, user_id)` rather than a `class_sessions` row, because a session usually
  doesn't exist yet at RSVP time (the coach creates it later via the Attendance page) —
  RSVPing is a pure read/write against the template + date, no session gets silently
  created as a side effect. Row existence = has an RSVP of *some* status; un-RSVPing
  (from either status) deletes the row rather than tracking a "not going" state.
  Deliberately separate from `attendance`, since RSVP intent and actual attendance are
  different facts that can disagree (someone RSVPs then doesn't show, or shows without
  RSVPing). One-off sessions (`class_sessions.template_id IS NULL`) have no way to be
  RSVP'd to, and therefore can never have a waitlist either.

  **Every count against this table must filter `status = 'going'`, or a waitlisted row
  silently consumes a capacity slot, inflates a headcount, or arrives pre-marked present
  on the attendance roster.** The four counting sites (`student/rsvp.js`'s atomic insert,
  `student/upcoming.js`'s grouped counts, `coach/next-class.js`'s headcount,
  `coach/sessions/[id].js`'s attendance pre-fill) all do. Three status-*aware-but-not-
  counting* sites in `rsvp.js` (the existing-row check, the ambiguous-`changes`
  re-check, the cancel DELETE) are deliberately unfiltered — they need to find a row
  regardless of its status, for logic rather than counting. See "Waitlist and
  notifications" below for the full behaviour.

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
  `addDaysIso`, `RSVP_WINDOW_DAYS`, and (Phase 2) `sastNowParts(now = new Date())`
  returning `{ date, time }` (`time` as `'HH:MM'`) from one shifted `Date` — `todayIso`
  now delegates to it (`sastNowParts(now).date`), confirmed behaviour-preserving against
  the existing SAST-vs-UTC regression tests. Used across `coach/sessions.js` (matching a
  date to a weekly template), `student/upcoming.js`/`student/rsvp.js` (the 7-day window),
  and `coach/next-class.js` (needs both the date and the time-of-day).
- `functions/api/_utils/body.js` (Phase 2, T2.0) — `parseJsonBody(context)`, the shared
  parse-and-reject-non-object-JSON logic `student/rsvp.js` had inline before. Adopted in
  the four routes Phase 2 opened (`coach/templates.js`, `coach/templates/[id].js`,
  `coach/sessions.js`, `coach/sessions/[id].js`) plus `student/rsvp.js` itself. Seven
  pre-existing handlers still throw a bare 500 on a literal JSON `null` body — logged in
  `TODO.md`, fixed file-by-file as future phases open them.
- `functions/api/_utils/capacity.js` (Phase 2, T2.2) — `parseCapacity(value)`, the
  server-side validation shared by every capacity-accepting route: a positive integer,
  or `null`/`undefined`/`''` meaning unlimited; rejects by `typeof` before any numeric
  coercion (so `true`/`[1]`/`{}` — which `Number()` would otherwise coerce to `1` — are
  rejected outright, not accepted as capacity 1).
- `functions/api/_utils/schedule.js` (Phase 2, T2.4) — `expandTemplates(templates,
  dates)`, extracted from `student/upcoming.js`'s original inline expansion (pinned
  behaviour-preserving by a test written before the refactor) and now shared with
  `coach/next-class.js`; and `selectNextClass(templates, today, nowTime, windowDays)`, a
  pure function (no clock reads of its own) picking the earliest `(date, startTime)` a
  class starting on `today` only survives if `startTime >= nowTime`. Being pure is what
  makes the mid-week/later-today/week-rollover/00:30-SAST-boundary scenarios
  unit-testable without touching the real clock.
- `functions/api/_utils/waitlist.js` (Phase 3) — `promoteWaitlist(db, templateId, date)`:
  resolves effective capacity, then promotes the oldest waitlisted rows (`created_at`,
  then `user_id` for a deterministic same-second tie-break) into whatever spots are
  free, in one `UPDATE ... WHERE user_id IN (SELECT ... ORDER BY ... LIMIT ...)
  RETURNING user_id` statement — the free-spot count is computed *inside* the statement,
  the same discipline `rsvp.js`'s atomic insert uses, so concurrent callers can't
  over-promote. Never demotes a `going` row. `waitlistPosition(db, templateId, date,
  userId)` — 1-indexed queue position (D3: shown, not total queue length), same
  ordering. `waitlistCount(db, templateId, date)` — total waitlisted count (the coach
  panel's number, and a new join's "resulting queue length"). `promoteAndNotify(context,
  templateId, date)` — wraps `promoteWaitlist` and fires one `waitlist_promoted` event
  (to the student and the coach) per promoted student; every write path that can free or
  add a spot calls this, not `promoteWaitlist` directly, so a new call site can't forget
  the notification.
- `functions/api/_utils/notify.js` (Phase 3) — `buildEvent(type, payload)`, pure:
  returns `{type, subject, text, json}` — a stable bracketed subject
  (`[CJN][WAITLIST_JOINED] Mon 18:00 Adults — 2026-08-10`) and a `key: value`-per-line
  body (`json`'s own insertion order, `event` first), parseable by a naive
  inbox-watching automation. `notifyCoach(env, ctx, event)` and `notifyStudent(env, ctx,
  to, event)` dispatch through `ctx.waitUntil()` so email/webhook latency never blocks
  the caller, each path independently gated (`COACH_NOTIFY_EMAIL`+`RESEND_API_KEY` for
  coach email, `COACH_WEBHOOK_URL` for the webhook, `RESEND_API_KEY` alone for the
  student email) and wrapped in its own `try/catch` — `sendEmail` doesn't catch a
  network-level `fetch` rejection, and neither does a bare webhook `fetch`, so either
  failing must never surface as a broken RSVP. No env vars set is a pure no-op.
- `public/app.js` (Phase 1, T1.1) — shared frontend behaviour: the nav/hamburger toggle,
  the logout handler, `escapeHtml`, the `#year` footer stamp, a
  `fetchJson(url, options)` wrapper (`fetch` + `.json()` in one call, catching a network
  failure or non-JSON body and returning a synthetic `{ok:false, error}` instead of
  throwing), and (Phase 2, T2.4) `sastTodayIso()` — computed from `Date.now()` + a fixed
  +2h offset (no `getTimezoneOffset()` call, so it's structurally independent of the
  visiting browser's local timezone), mirroring `_utils/dates.js`'s server-side
  `todayIso()`. Duplicated rather than imported, since this is a plain browser
  `<script>` with no bundler and that's a server ES module — the same no-build-step
  tradeoff already accepted for `dateFromQuery()`/`isValidDate()` in Phase 1. Each copy's
  comment names the other; `test/unit/shared-frontend.test.mjs` asserts both carry the
  same offset. `coach/attendance.html` calls it for its date-input default, replacing
  the old browser-local `todayLocalIso()` (deleted — it was the third, disagreeing
  notion of "today" alongside the server's SAST `todayIso()` and plain UTC `new Date()`).
  Every DOM lookup inside `app.js` is guarded — three pages (`login.html`,
  `change-password.html`, `request-account.html`) have a logo-only header with none of
  the nav/logout elements.

  **Load order, and why it matters**: `<script src="/app.js?v=2"></script>` (a plain
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
| `/api/coach/templates` | GET/POST | coach | list (with `capacity`) / create recurring weekly classes (`capacity` optional, validated by `parseCapacity`) |
| `/api/coach/templates/:id` | PATCH | coach | **partial update** (Phase 2, T2.2) — `{active}` and/or `{capacity}`, at least one required; a body with neither is rejected |
| `/api/coach/sessions?date=` | GET | coach | template suggestions + existing sessions for a date, both now include `capacity` |
| `/api/coach/sessions` | POST | coach | create from template (idempotent, capacity **not** copied from the template — see resolution rule above) or one-off |
| `/api/coach/sessions/:id` | GET | coach | session detail + roster merged with existing attendance; also returns `capacity` (this session's own), `effectiveCapacity` (resolved), `attendanceSaved` (Phase 2, T2.5 — `true` once any attendance row exists for this session, letting the client distinguish "never saved" from "saved with everyone absent"), and (Phase 3, T3.7) a separate `waitlist` array (`{id,name,email}`, queue order) — the roster's own `going` flag is `status='going'`-filtered, so a waitlisted student is on the roster (still an active student who could show up) but never pre-marked present |
| `/api/coach/sessions/:id` | PATCH | coach | (Phase 2, T2.2) `{capacity}` — the per-session override; `null`/`''` clears back to inheriting the template. (Phase 3, T3.5) On success, calls `promoteAndNotify` for this session's own date — safe to call on any capacity change, including a decrease (promotes zero) |
| `/api/coach/mark-attendance` | POST | coach | `{sessionId,records:[{userId,status}]}`, atomic via `D1Database.batch()` |
| `/api/coach/next-class` | GET | coach | (Phase 2, T2.4) `{nextClass: null \| {templateId,name,date,startTime,endTime,attending,capacity,spotsRemaining,waitlisted}}` — the soonest class in the next `RSVP_WINDOW_DAYS` days, `null` if nothing's scheduled. `waitlisted` (Phase 3, T3.7) is the total waitlisted count; the dashboard panel only shows it when non-zero |
| `/api/student/attendance` | GET | student | own history only |
| `/api/student/upcoming` | GET | student | next 7 days of weekly-template classes, merged with own RSVPs; each row has `capacity`, `attending` (`status='going'` count, not just the caller's), `full`, and (Phase 3, T3.6) `rsvpStatus` (`null \| 'going' \| 'waitlisted'`) + `waitlistPosition` (`null` unless waitlisted). `going` means `rsvpStatus === 'going'` specifically — **not** "has any row" (that was the pre-Phase-3 meaning; a waitlisted row would otherwise read as `going:true`, wrongly) |
| `/api/student/rsvp` | POST | student | `{templateId,date,going}` → insert/delete own `session_rsvps` row. **The old 409 is gone (Phase 3, T3.2).** `going:true` against a class at capacity now waitlists instead of rejecting: `{ok:true, status:'going'\|'waitlisted', position?}`. A student who already has a row is never rejected (idempotent re-RSVP from either status). The going-path capacity check is atomic (`INSERT...SELECT...WHERE COUNT(status='going') < capacity`, not read-then-insert) so two students racing for the last spot can't both win — the loser waitlists instead. `going:false` is `DELETE...RETURNING status`; a freed `going` row calls `promoteAndNotify` (a freed `waitlisted` row does not — nothing to promote into). |

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
  (`styles.css?v=4` as of this writing), and `app.js` likewise (`app.js?v=2` as of Phase
  2's T2.4). **Bump the relevant number on every future change to that asset, on every page that references
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

## Waitlist and notifications (Phase 3)

A full class's `going:true` RSVP now waitlists instead of returning 409 (see the API
reference above). Facts worth knowing before touching this code:

- **A `going` row is never demoted, by any code path, ever.** Every capacity decision —
  the initial atomic insert, and every promotion — is made inside a single SQL
  statement, never a separate read-count-then-write. `promoteWaitlist` only ever sets
  `waitlisted` rows to `going`.
- **Promotion is centralized in `promoteWaitlist`/`promoteAndNotify`** (see "Shared
  code" above). Four write paths call it: `rsvp.js`'s cancel path (a freed `going` row),
  `rsvp.js`'s full-class join path (closes the window where a spot opened between the
  failed going-insert and the waitlist insert — normally promotes nobody),
  `coach/templates/[id].js`'s capacity PATCH (bounded to `today..RSVP_WINDOW_DAYS`, only
  dates that actually have a waitlisted row, found with one grouped `DISTINCT` query —
  a template capacity change affects every future date it expands to, not one date), and
  `coach/sessions/[id].js`'s capacity PATCH (affects exactly that session's own date).
- **Two events, D1's decision: waitlist join only, not a class merely reaching
  capacity.** `waitlist_joined` (to the coach) fires only when a genuinely *new*
  waitlisted row is created (the insert's own `changes === 1`, not a double-submit
  no-op) — never on a repeat RSVP from an already-waitlisted student, since that branch
  returns before ever reaching the insert. `waitlist_promoted` (to the student **and**
  the coach) fires once per promoted student, driven by the `user_id`s
  `promoteWaitlist` returns.
- **Notification env vars** (`public/.dev.vars`, left empty locally): `COACH_NOTIFY_EMAIL`
  (required for the email path, alongside the existing `RESEND_API_KEY`),
  `COACH_WEBHOOK_URL` + `COACH_WEBHOOK_SECRET` (optional; the secret is sent as
  `X-CJN-Signature` on the webhook POST). Each of the three notify.js dispatch paths
  (coach email, coach webhook, student email) is independently gated, so the feature
  ships working with any combination configured, including none. Dispatch never blocks
  or breaks the calling request — see `notify.js` above.
  **Set in production via `wrangler`, not the dashboard** (T3.8): this project's Pages
  Variables UI (Settings → Environment variables) is disabled, showing "managed through
  wrangler.toml" — a consequence of declaring `pages_build_output_dir` in
  `wrangler.jsonc`, which puts config-file management in front of that particular UI.
  `wrangler pages secret put` still works, since it writes via the API directly rather
  than through that UI:
  ```bash
  printf '%s' 'info@cjnacademy.com' | wrangler pages secret put COACH_NOTIFY_EMAIL --project-name=kickboxingwebsite
  ```
  Run from `public/` (or pass `--cwd public`). `wrangler pages secret list
  --project-name=kickboxingwebsite` confirms what's set (values are write-only —
  Encrypted, not readable back). Note the actual Cloudflare Pages project name is
  `kickboxingwebsite`, not `cjn-academy-website` (the unrelated `"name"` field in
  `public/wrangler.jsonc`) — get this from `wrangler pages project list` if unsure.

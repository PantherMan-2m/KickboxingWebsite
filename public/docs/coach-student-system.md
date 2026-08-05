# Coach/Student Login & Attendance System

**Status**: Phase 1, Phase 2 (self-signup + approval), and Phase 3 (class RSVPs)
complete and live (2026-08-04); Phase 0 (foundation: local dev environment, automated
tests, migration tracking, backups) and Phase 1 (shared `app.js`, navigation fixes)
complete and merged to `main` (2026-08-05). This is a living document — update it (don't
replace it) as new features land. See `TODO.md` (outer folder) for what's not built yet.

This doc has two halves: **Part 1** explains what the system does and how to use it in
plain English. **Part 2** is the technical reference — schema, endpoints, security
mechanics — for whoever (human or AI) needs to modify the code later.

---

# Part 1: What it does, and how to use it

## Who can do what

- **Coaches** can: manage the student roster, define the weekly class schedule, create
  one-off extra sessions, mark attendance, and see who's RSVP'd "going" to a class.
- **Students** can: log in, see their own attendance history, RSVP to upcoming classes,
  or (if they don't have an account yet) request one.

## Logging in

Go to `cjnacademy.com/login.html`, enter email + password. There's also a **Login** link
in the homepage nav (desktop and mobile).

First login after an account is created (by a coach, or via the bootstrap script) always
forces a password change before anything else works — you'll be redirected to
`change-password.html` automatically.

**Locked out?** After 5 wrong password attempts in a row, the account locks for 15
minutes (even a correct password is rejected during that window, with the same generic
"Invalid email or password" message — this is intentional, so a wrong-password guess
can't be used to figure out whether an account exists at all). It unlocks automatically
after 15 minutes; there's no manual unlock UI yet. If you need to force it open sooner,
see "Common maintenance tasks" below.

## Requesting an account

Don't have an account yet? Go to `cjnacademy.com/request-account.html` (also linked from
the login page) and submit your name + email. This doesn't create a working account
immediately — it creates a **pending** request that a coach has to approve from the
Requests page. You'll get an email with a temporary password once that happens. There's
no signal on the request page itself either way (approved or not), so if you don't hear
back, follow up with a coach directly.

## Coach walkthrough

1. **Dashboard** (`/coach/dashboard.html`) — landing page with shortcuts to everything else.
2. **Students** (`/coach/students.html`) — add a student (name + email). This creates
   their account with a random temporary password and emails it to them via Resend. If
   the email fails to send, the temporary password is shown on-screen instead so you can
   hand it over directly. You can also deactivate/reactivate a student here (deactivating
   removes them from future attendance-marking rosters, but keeps their history intact —
   nothing is ever hard-deleted).
3. **Requests** (`/coach/requests.html`) — anyone who submitted the public "request an
   account" form shows up here. **Approve** activates their account and emails a
   temporary password (same mechanics as adding a student directly, including the
   on-screen fallback if the email fails). **Reject** deletes the request outright —
   there's no "rejected" state to revisit, so only reject requests you're sure about.
4. **Schedule** (`/coach/templates.html`) — define the recurring weekly classes (day,
   time, name). This is the *template*, not actual dated sessions.
5. **Attendance** (`/coach/attendance.html`) — pick a date. If that date matches a
   weekly template (e.g. it's a Tuesday and you have a Tuesday class), you'll see a
   "Create session" button for it. You can also add a one-off extra session for any date
   (e.g. an extra Friday class) without touching the weekly template. Either way, this
   creates a `class_sessions` row you can then open to mark attendance.
6. **Marking attendance** (`/coach/session.html?id=...`) — shows the full active student
   roster with an RSVP column (✓ Going if that student RSVP'd for this date's class) next
   to present/absent/excused radio buttons per student (defaults to absent). The RSVP
   column is only ever populated for sessions created from a weekly template — one-off
   sessions have no RSVPs to show, since students can only RSVP to the recurring
   schedule (see "What's deliberately not built yet"). Save writes the whole roster at
   once. You can reopen a session later and it'll pre-fill from whatever was last saved,
   so amending attendance after the fact is safe.

## Student walkthrough

Log in → lands on `/student/dashboard.html` → see a table of every session you've been
marked in, with date, class name, and status. The **Upcoming classes**
(`/student/upcoming.html`) nav link shows the next 7 days of recurring weekly classes,
each with an "I'm going" button — tap it to RSVP, tap again to cancel. This is just a
heads-up for the coach; it doesn't create or replace an actual attendance record, and
you're not locked out of a class you didn't RSVP to (or penalized for RSVPing and not
showing).

## Bootstrapping a coach account

There's no signup flow yet, so every account is either created by a coach (via the
Students page) or, for the very first coach, via a local script:

```bash
node bootstrap-user.js "email@example.com" "Full Name" coach
```
(run from the outer project folder, not `public/`). It prompts for a password locally
(masked, never sent anywhere) and prints a SQL `INSERT` statement to run via:
```bash
npx wrangler d1 execute cjn-academy --remote --command="<paste the INSERT>"
```

## Common maintenance tasks

All of these use `wrangler` (unpinned — requires Node 22+, see "Stack" below) from the
`public/` folder:

**Back up production before every migration** (standing rule — never run a migration
against production without a fresh export in hand):
```bash
npx wrangler d1 export cjn-academy --remote --output="../backups/cjn-academy-<YYYY-MM-DD>.sql"
```
Run from `public/`. Writes to a `backups/` folder in the **outer** project folder (sibling
to `public/`, not inside it), so the export — which contains real user data, including
password hashes — is never committed to git. Exports schema and data for all tables in one
file. To restore, replay the file's `CREATE TABLE`/`INSERT` statements against a target
database (e.g. `npx wrangler d1 execute cjn-academy --remote --file=../backups/<file>.sql`
— only ever do this deliberately, it's a full overwrite).

**Force-unlock a locked-out account immediately** (instead of waiting 15 min):
```bash
npx wrangler d1 execute cjn-academy --remote --command="UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = 'someone@example.com';"
```

**Reset someone's password** (e.g. they forgot it — there's no self-service "forgot
password" flow yet): generate a new hash with `bootstrap-user.js`'s hashing logic (or
just run the script again mentally — same PBKDF2 format), then:
```bash
npx wrangler d1 execute cjn-academy --remote --command="UPDATE users SET password_hash = '<hash>', must_change_password = 1 WHERE email = '...';"
```

**Deactivate/reactivate a student without the UI**:
```bash
npx wrangler d1 execute cjn-academy --remote --command="UPDATE users SET status = 'inactive' WHERE email = '...';"
```

**Look at the data directly**:
```bash
npx wrangler d1 execute cjn-academy --remote --command="SELECT * FROM users;"
```

---

# Part 2: Technical reference

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
  Coverage: login (success/wrong-password/nonexistent/inactive/pending, and that every
  failure mode returns a byte-identical response), lockout (5 failures locks, correct
  password still rejected during the window), all five route-protection middlewares
  (unauthenticated/wrong-role/must-change-password — coach pages, student pages, coach
  API, student API, and `/docs/*`), and RSVP (create/delete round-trip, past-date
  rejection, and the T0.6b day-of-week/window regressions below).
- `test/helpers/auth.mjs` — the shared `login(email, password)` helper every integration
  test file uses; returns `{res, cookie}`, callers read the body themselves.

**Reserved seeded accounts — never log into these manually**, the test suite mutates
their state on purpose: `lockout1@seed.test` (deliberately locked by the lockout test),
`coachmustchange@seed.test` / `mustchange1@seed.test` (used for must-change-password
redirect checks). `pending1@seed.test` has a known password *on purpose* (see above) but
is otherwise safe to reference — its account state is never mutated by a test.

**Regression tests (T0.6b)**, both written failing-first and confirmed passing after the
fix (see `reports/phase-0-completion.md` in the outer folder for the actual before/after
command output):
1. `test/unit/dates.test.mjs` — `todayIso()` returning the UTC date instead of the SAST
   (Africa/Johannesburg, UTC+2 fixed) calendar date for roughly two hours after UTC
   midnight. Fixed by adding a fixed +2h offset before formatting; `todayIso()` now takes
   an optional `now` argument (defaults to the real clock) purely so the bug is testable
   without mocking global time.
2. `test/integration/rsvp.test.mjs` — `POST /api/student/rsvp` accepted a date whose
   day-of-week didn't match the template, or one outside the 7-day window the UI offers.
   Fixed in `rsvp.js` by checking `dayOfWeekFor(date) === template.day_of_week` and that
   `date` falls within `[todayIso(), todayIso()+6]`. **This validation applies to
   creating an RSVP only (`going === true`)** — a follow-up review found the first version
   also blocked *cancelling* an RSVP that failed these checks (e.g. a row created before
   this fix, or one whose template's `day_of_week` changed afterward), which would have
   made such a row permanently stuck. Cancellation (`going === false`) now requires only
   that the row belongs to the caller.

**Bonus fix found while writing the date-helper tests, outside T0.6b's original two
named bugs**: `isValidDate('2026-02-30')` returned `true`, because `new Date(...)`
silently normalizes overflowing calendar components (Feb 30 → Mar 2) instead of
producing `NaN`. Fixed by round-tripping the parsed date back to a string and comparing
against the input.

**Found in the same follow-up review**: `rsvp.js` destructured the parsed JSON body
without checking it was non-null first — a literal JSON `null` body parses successfully
(not a `.json()` error), so it reached an unguarded destructure and crashed with an
uncaught 500 instead of a graceful 400. Fixed with an explicit
`if (!body || typeof body !== 'object')` guard. The same pattern exists in several other
handlers that parse a JSON body; not fixed elsewhere in this pass, logged in `TODO.md`.

## Migration tracking

`wrangler.jsonc` declares `migrations_dir: "migrations"` on the `DB` binding, so
`wrangler d1 migrations list/apply` (local and `--remote`) tracks applied migrations via
a `d1_migrations` table, instead of migrations being run by hand with `d1 execute`.

**One-time reconciliation (done 2026-08-05, not to be repeated)**: production already had
`0001_initial.sql` and `0002_session_rsvps.sql` applied by hand before migration tracking
was adopted, but D1 provisions an empty `d1_migrations` table by default — it had zero
rows, which would have made Wrangler try to re-run `0001` against tables that already
exist. Fixed by inserting rows recording both as already applied, without re-running
their SQL:
```sql
INSERT INTO d1_migrations (name, applied_at) VALUES
  ('0001_initial.sql', '<actual apply timestamp>'),
  ('0002_session_rsvps.sql', '<actual apply timestamp>');
```
Any *new* migration from here on should be created with
`wrangler d1 migrations create cjn-academy <name>` and applied with
`wrangler d1 migrations apply cjn-academy --remote` (after a fresh backup, see below) —
never with a raw `d1 execute --file=...`, which wouldn't record itself in `d1_migrations`
and would reintroduce the same mismatch this reconciliation fixed.

## Node/Wrangler requirement

This project requires Node 22+ (current: Node 24.19.0) to run unpinned `wrangler` (4.x).
The `wrangler d1`/`wrangler pages` commands documented in "Common maintenance tasks" above
use plain `npx wrangler`. The local dev tooling (`npm run dev`, `npm run db:reset`, and the
test suite) deliberately does not — see "Local development environment" above for why it
spawns `wrangler` directly via `node <wrangler.js>` instead.

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
  100,000 iterations (timed against this project's Workers CPU budget during
  development — comfortably fast, not a bottleneck). Iteration count is stored in the
  hash string itself, so it can be raised later without invalidating existing hashes.
- **Sessions**: `crypto.randomUUID()` token stored in `sessions.id`, set as the cookie
  value directly (`HttpOnly; Secure; SameSite=Lax; Path=/`, 14-day fixed TTL, no sliding
  renewal). No HMAC signing needed since the DB lookup is the source of truth.
- **Brute-force lockout**: 5 consecutive failed attempts locks the account for 15
  minutes (`users.failed_login_attempts` / `locked_until`). Resets to 0 on any
  successful login. All failure modes (no such user, wrong password, inactive, locked)
  return the identical generic `401 {ok:false, error:'Invalid email or password'}` to
  avoid leaking which case applied (user enumeration protection).
- **Route protection**: Cloudflare Pages Functions `_middleware.js`, which — confirmed
  against Cloudflare's docs during development — genuinely gates *static* HTML pages,
  not just API routes. Five middleware files: `functions/coach/_middleware.js` and
  `functions/student/_middleware.js` gate the static pages (redirect to `/login.html` if
  unauthenticated, redirect to the other role's dashboard if wrong role, redirect to
  `/change-password.html` if `must_change_password`); `functions/api/coach/_middleware.js`
  and `functions/api/student/_middleware.js` do the same for API routes but return JSON
  401/403 instead of redirecting (since those are `fetch()` calls, not navigations); and
  `functions/docs/_middleware.js` (T0.8) gates `/docs/*`, coach-only. Each middleware
  stashes the resolved user on `context.data.user` so downstream handlers don't need a
  second session lookup.

## Shared code

- `functions/api/_utils/auth.js` — hashing, session CRUD, cookie helpers,
  `getSessionUser(context)`. Lives under an underscore-prefixed folder so Pages Functions
  excludes it from routing, but it's still a normal ES module importable by sibling
  handler files (confirmed working in production, not just assumed).
- `functions/api/_utils/email.js` — thin Resend wrapper, deliberately separate from the
  pre-existing `functions/api/contact.js` so that already-working file stays untouched.
- `functions/api/_utils/dates.js` — `isValidDate`, `dayOfWeekFor`, `todayIso`,
  `addDaysIso`. Used by both `coach/sessions.js` (matching a date to a weekly template)
  and `student/upcoming.js` (projecting the next 7 days).
- `public/app.js` (Phase 1, T1.1) — shared frontend behaviour loaded on all 12 pages via
  `<script defer src="/app.js?v=1"></script>` in `<head>`: the nav/hamburger toggle, the
  logout handler, `escapeHtml`, the `#year` footer stamp, and a `fetchJson(url, options)`
  wrapper (`fetch` + `.json()` in one call). Every DOM lookup inside it is guarded — three
  pages (`login.html`, `change-password.html`, `request-account.html`) have a logo-only
  header with none of the nav/logout elements. Any page-specific script that calls
  `fetchJson`/`escapeHtml` on load (not from inside a later event handler) must defer that
  call to `DOMContentLoaded` — `defer` only guarantees execution before `DOMContentLoaded`,
  not before a trailing inline `<script>` already in the same document, which runs during
  parsing. Calling an `app.js` function synchronously at the top of such a script throws a
  silent, uncaught-in-promise `ReferenceError` with no console output. See any of
  `coach/attendance.html`, `coach/requests.html`, `coach/session.html`,
  `coach/students.html`, `coach/templates.html`, `student/dashboard.html`, or
  `student/upcoming.html` for the pattern.

## API reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | public | `{email,password}` → session cookie |
| `/api/auth/logout` | POST | public (no-op if none) | revokes session, clears cookie |
| `/api/auth/change-password` | POST | any logged-in user | `{newPassword}`, clears `must_change_password` |
| `/api/auth/request-account` | POST | public | `{name,email}` → creates a `pending` user (silently no-ops if the email already exists); always returns the same generic success response |
| `/api/auth/session` | GET | public | session state for the homepage's Login/My-dashboard swap; always `200 {ok:true, user:{name,role}}` or `{ok:true, user:null}` — never a 401 or redirect, and never more than `name`+`role` |
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

- No build step, no JS modules/bundler. Shared behaviour (nav/hamburger, logout,
  `escapeHtml`, `#year`, `fetchJson`) lives in `public/app.js` (Phase 1, T1.1 — see "Shared
  code" above), loaded on every page. Each page still has its own trailing inline
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
  (`styles.css?v=4` as of this writing). **Bump this number on every future CSS change**
  — Cloudflare serves the HTML itself with `max-age=0` (always fresh), but `styles.css`
  has a 4-hour browser cache; without the version bump, visitors can keep seeing stale
  CSS for hours after a fix ships. This bit us twice during development before the
  versioning was added.
- Mobile nav (toggle button, `.nav-links.open` class, closes on link-click or scroll,
  locks body scroll while open) is now one implementation in `app.js`, shared by all 12
  pages including the homepage (Phase 1, T1.1 — previously each page had its own copy).
  Every authenticated page's nav also has an explicit "Home" link back to `/` (Phase 1,
  T1.2); the homepage swaps "Login" for "My dashboard" when `/api/auth/session` reports a
  logged-in visitor.
- Every new table (roster, weekly schedule, session roster, student history, upcoming
  classes) wraps in `.scroll-x` like the original schedule table, for mobile horizontal
  scrolling.

## What's deliberately not built yet

- RSVPs only cover the recurring weekly schedule, not one-off/extra sessions — those
  have no `class_templates` row to key an RSVP off of, and are typically announced and
  created by the coach same-day anyway. Low priority to extend unless it comes up.
- No self-service "forgot password" flow (coach/admin resets manually via SQL, see
  "Common maintenance tasks").
- No IP-based rate limiting on `/api/auth/login`, only the per-account lockout above.
  Fine at gym scale; revisit if abuse ever shows up.

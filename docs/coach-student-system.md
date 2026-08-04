# Coach/Student Login & Attendance System

**Status**: Phase 1, Phase 2 (self-signup + approval), and Phase 3 (class RSVPs)
complete and live (2026-08-04). This is a living document — update it (don't replace it)
as new features land. See `TODO.md` (outer folder) for what's not built yet.

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
npx wrangler@3 d1 execute cjn-academy --remote --command="<paste the INSERT>"
```

## Common maintenance tasks

All of these use `wrangler@3` (pinned — see "Why wrangler@3" below) from the `public/`
folder:

**Force-unlock a locked-out account immediately** (instead of waiting 15 min):
```bash
npx wrangler@3 d1 execute cjn-academy --remote --command="UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = 'someone@example.com';"
```

**Reset someone's password** (e.g. they forgot it — there's no self-service "forgot
password" flow yet): generate a new hash with `bootstrap-user.js`'s hashing logic (or
just run the script again mentally — same PBKDF2 format), then:
```bash
npx wrangler@3 d1 execute cjn-academy --remote --command="UPDATE users SET password_hash = '<hash>', must_change_password = 1 WHERE email = '...';"
```

**Deactivate/reactivate a student without the UI**:
```bash
npx wrangler@3 d1 execute cjn-academy --remote --command="UPDATE users SET status = 'inactive' WHERE email = '...';"
```

**Look at the data directly**:
```bash
npx wrangler@3 d1 execute cjn-academy --remote --command="SELECT * FROM users;"
```

---

# Part 2: Technical reference

## Stack

Cloudflare Pages (static site + Functions) + **D1** (managed SQLite), no build step, no
npm dependencies bundled into the deployed site — everything uses what's natively
available in the Workers runtime (Web Crypto API, `crypto.randomUUID()`).

Git repo root is `public/` (see main `HANDOVER.md` for the full repo-structure history).
`wrangler.jsonc` at the repo root declares the D1 binding (`DB`) for local dev; the
*production* binding is set via the Cloudflare Pages dashboard (Settings → Bindings),
not read from `wrangler.jsonc` for the live Git-integrated deploy.

## Why `wrangler@3`

This machine's Node is v18; current Wrangler requires Node 22+. All `wrangler d1`/
`wrangler pages` commands in this project use `npx wrangler@3` explicitly. Upgrading
Node would remove the need for the pin.

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
  not just API routes. Four middleware files: `functions/coach/_middleware.js` and
  `functions/student/_middleware.js` gate the static pages (redirect to `/login.html` if
  unauthenticated, redirect to the other role's dashboard if wrong role, redirect to
  `/change-password.html` if `must_change_password`); `functions/api/coach/_middleware.js`
  and `functions/api/student/_middleware.js` do the same for API routes but return JSON
  401/403 instead of redirecting (since those are `fetch()` calls, not navigations).
  Each middleware stashes the resolved user on `context.data.user` so downstream handlers
  don't need a second session lookup.

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

## API reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | public | `{email,password}` → session cookie |
| `/api/auth/logout` | POST | public (no-op if none) | revokes session, clears cookie |
| `/api/auth/change-password` | POST | any logged-in user | `{newPassword}`, clears `must_change_password` |
| `/api/auth/request-account` | POST | public | `{name,email}` → creates a `pending` user (silently no-ops if the email already exists); always returns the same generic success response |
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

- No build step, no JS modules/bundler — every new page has its own inline `<script>`
  (can't share `script.js` as-is since it references homepage-only elements like
  `#contactForm`; loading it on other pages would throw and halt execution).
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
- Mobile nav on the coach/student pages replicates the homepage's exact hamburger-menu
  pattern (toggle button, `.nav-links.open` class, closes on link-click or scroll, locks
  body scroll while open) — each page has its own copy of that JS since there's no
  shared module system.
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

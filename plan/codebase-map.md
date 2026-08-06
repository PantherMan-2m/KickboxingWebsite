# Codebase Map

Findings get recorded here as data, not re-derived each session — per `PLAN.md`'s "Keeping
sessions cheap" rule. Verified against the code on 2026-08-06, at the Phase 1 → 2 checkpoint
(`main` at `2dd4d2d`, Phase 1 merged). Update this file when the codebase's shape changes; do
not let a session re-grep for it.

## Page inventory (12 HTML pages, `public/`)

All 12 load `public/app.js` (a plain, non-`defer`red `<script>` placed immediately before
each page's own trailing inline `<script>`, at the end of `<body>` — see
`coach-student-system-technical.md`'s "Shared code" section for why the placement matters).

| Page | Header | Own script does |
|---|---|---|
| `index.html` | full nav (public: Classes/Schedule/Coaches/Pricing/Gallery/Login) | `script.js`: contact form + header-hide-on-scroll + login/dashboard swap |
| `login.html` | logo-only | login form submit |
| `change-password.html` | logo-only | change-password form submit |
| `request-account.html` | logo-only | request-account form submit |
| `coach/dashboard.html` | full nav (coach) | none — pure static links, nothing left after T1.1 |
| `coach/attendance.html` | full nav (coach) | date picker, template suggestions, one-off session form |
| `coach/requests.html` | full nav (coach) | pending-request list, approve/reject |
| `coach/session.html` | full nav (coach) | roster load/save, back-link to attendance with date |
| `coach/students.html` | full nav (coach) | roster list, add student, activate/deactivate |
| `coach/templates.html` | full nav (coach) | weekly-schedule list, add template |
| `student/dashboard.html` | full nav (student) | attendance history load |
| `student/upcoming.html` | full nav (student) | upcoming-classes list, RSVP toggle |

"Logo-only" header pages have no `.menu-toggle`, `.nav-links`, or `#logoutLink` — every
DOM lookup in `app.js` guards against their absence.

## Middleware (5 files)

| File | Gates | On failure |
|---|---|---|
| `functions/coach/_middleware.js` | coach static pages | redirect (`/login.html`, other role's dashboard, or `/change-password.html`) |
| `functions/student/_middleware.js` | student static pages | redirect, same shape |
| `functions/api/coach/_middleware.js` | coach API routes | JSON 401/403 |
| `functions/api/student/_middleware.js` | student API routes | JSON 401/403 |
| `functions/docs/_middleware.js` | `/docs/*` (both doc files) | redirect, coach-only |

`functions/api/auth/*` and `functions/api/contact.js` have **no** middleware — public by
construction, no exclusion mechanism needed (there's nothing to exclude from).

## Pages Functions tree (`public/functions/`)

```
functions/
├── package.json                    # marks this tree as ES modules for local testing
├── contact.js                      # public, pre-existing, untouched by Phase 0/1
├── coach/_middleware.js
├── student/_middleware.js
├── docs/_middleware.js
├── api/
│   ├── _utils/
│   │   ├── auth.js                 # hashing, sessions, cookies, getSessionUser, jsonResponse
│   │   ├── dates.js                # isValidDate, dayOfWeekFor, todayIso, addDaysIso, RSVP_WINDOW_DAYS
│   │   └── email.js                # Resend wrapper
│   ├── auth/                       # no middleware -- public by construction
│   │   ├── login.js
│   │   ├── logout.js
│   │   ├── change-password.js
│   │   ├── request-account.js
│   │   └── session.js              # T1.2, public session-state check
│   ├── coach/
│   │   ├── _middleware.js
│   │   ├── students.js             + students/[id].js
│   │   ├── requests.js             + requests/[id].js
│   │   ├── templates.js            + templates/[id].js
│   │   ├── sessions.js             + sessions/[id].js
│   │   └── mark-attendance.js
│   └── student/
│       ├── _middleware.js
│       ├── attendance.js
│       ├── upcoming.js
│       └── rsvp.js
```

## HTTP verb inventory (grepped 2026-08-06, complete)

| Route file | Verbs | Notes worth knowing before you edit it |
|---|---|---|
| `api/auth/login.js` · `logout.js` · `change-password.js` · `request-account.js` | POST | |
| `api/auth/session.js` | GET | public session-state check (T1.2) |
| `api/contact.js` | POST | pre-existing, untouched since before Phase 0 |
| `api/coach/students.js` | GET, POST | |
| `api/coach/students/[id].js` | PATCH | |
| `api/coach/requests.js` | GET | |
| `api/coach/requests/[id].js` | PATCH | |
| `api/coach/templates.js` | GET, POST | GET selects no `capacity` column (none exists yet) |
| `api/coach/templates/[id].js` | PATCH | **rejects any body without a boolean `active`** — not a partial update |
| `api/coach/sessions.js` | GET, POST | GET returns `templatesForDay` + `sessions` for one date |
| `api/coach/sessions/[id].js` | **GET only** | any write to a session needs a new handler |
| `api/coach/mark-attendance.js` | POST | writes a row for the **whole** roster, not just those present (deliberate) |
| `api/student/attendance.js` · `upcoming.js` | GET | |
| `api/student/rsvp.js` | POST | the **only** handler guarding a literal JSON `null` body |

## Non-obvious behaviours that have already cost a session

- **`sessions/[id].js:45` coalesces `status: r.status || 'absent'`** — a never-saved session and
  one saved with everyone absent are indistinguishable in the response. Any feature that needs to
  tell them apart requires an API change, not client cleverness.
- **`session_rsvps` is keyed `(template_id, session_date, user_id)`**, not to a `class_sessions`
  row — students RSVP before a session exists. One-off sessions (`template_id IS NULL`) can never
  have RSVPs.
- **`rsvp.js` validates in a deliberate 400-before-404 order**, pinned by a test. Window and
  day-of-week checks apply to creating an RSVP only, never to cancelling.
- **Three notions of "today"** as of Phase 1: the server's SAST `todayIso()` (`_utils/dates.js`),
  `coach/attendance.html`'s browser-local `todayLocalIso()`, and plain UTC `new Date()` anywhere
  untouched. `_utils/dates.js` has **no** time-of-day helper — only dates. Phase 2's T2.4
  reconciles the first two.
- **`fetchJson` never throws** since Phase 1's fix pass: on network/parse failure it returns
  `{ response: null, data: { ok:false, error:'Network error. Please try again.' } }`. Call sites
  use `response?.ok`.
- **Page scripts run synchronously** at the end of `<body>`; Phase 1 removed the hand-copied
  `DOMContentLoaded` wrappers from seven files.
- **Ten handlers still throw a bare 500 on a literal JSON `null` body** (everything in the verb
  table above except `rsvp.js`). Logged in `TODO.md`; fixed file-by-file as phases open them.

## Migrations

`public/migrations/` — `0001_initial.sql`, `0002_session_rsvps.sql`. Tracked via
`migrations_dir` in `wrangler.jsonc`; production's `d1_migrations` table was reconciled in
Phase 0 to record both as already applied. Next number is `0003`.

## Static asset versions (bump on every change, every referencing page — `PLAN.md` rule 6)

`styles.css?v=4` · `app.js?v=1` (all 12 pages). Check with `grep -rn "app\.js?v=" public`.

## Database schema (6 tables)

`users`, `sessions` (login sessions, not class sessions), `class_templates`,
`class_sessions`, `attendance`, `session_rsvps`. Full column-level detail in
`coach-student-system-technical.md`'s "Database schema" section — not duplicated here,
since this map is structural (what exists and where), not explanatory (why/how).

## Local dev tooling (outer folder, all tracked since `f0c3ec8`)

`scripts/lib/devEnv.js` (shared config/wrangler-spawning), `scripts/dev-server.js`,
`scripts/db-reset-seed.js`, `test/unit/`, `test/integration/`, `test/helpers/`. Detail in
`coach-student-system-technical.md`'s "Local development environment" and "Automated
tests" sections.

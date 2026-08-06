# Codebase Map

Findings get recorded here as data, not re-derived each session — per `PLAN.md`'s "Keeping
sessions cheap" rule. Verified against the code on 2026-08-06, at the Phase 1 checkpoint.
Update this file when the codebase's shape changes; do not let a session re-grep for it.

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

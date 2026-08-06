# Codebase Map

Findings get recorded here as data, not re-derived each session — per `PLAN.md`'s "Keeping
sessions cheap" rule. Verified against the code on 2026-08-07, after Phase 2 merged to
`main` (`ac9d39f`, migration `0003` applied to production). Update this file when the
codebase's shape changes; do not let a session re-grep for it.

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
| `coach/dashboard.html` | full nav (coach) | Phase 2 T2.4: next-class panel (`GET /api/coach/next-class`) |
| `coach/attendance.html` | full nav (coach) | date picker (now `sastTodayIso()`-based), template suggestions, one-off session form |
| `coach/requests.html` | full nav (coach) | pending-request list, approve/reject |
| `coach/session.html` | full nav (coach) | roster load/save with RSVP pre-fill (T2.5), capacity-override form (T2.2), back-link to attendance with date |
| `coach/students.html` | full nav (coach) | roster list, add student, activate/deactivate, search + status filter (T2.6) |
| `coach/templates.html` | full nav (coach) | weekly-schedule list + capacity field (T2.2), add template |
| `student/dashboard.html` | full nav (student) | attendance history load |
| `student/upcoming.html` | full nav (student) | upcoming-classes list, RSVP toggle, spots-remaining/"Full" state (T2.3) |

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
│   │   ├── dates.js                # isValidDate, dayOfWeekFor, todayIso, addDaysIso, RSVP_WINDOW_DAYS, sastNowParts (T2.4)
│   │   ├── email.js                # Resend wrapper
│   │   ├── body.js                 # T2.0: parseJsonBody(context)
│   │   ├── capacity.js             # T2.2: parseCapacity(value)
│   │   └── schedule.js             # T2.4: expandTemplates(), selectNextClass()
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
│   │   ├── mark-attendance.js
│   │   └── next-class.js           # T2.4: GET, the coach-dashboard headcount panel's endpoint
│   └── student/
│       ├── _middleware.js
│       ├── attendance.js
│       ├── upcoming.js
│       └── rsvp.js
```

## HTTP verb inventory (grepped 2026-08-07, complete, post-Phase-2)

| Route file | Verbs | Notes worth knowing before you edit it |
|---|---|---|
| `api/auth/login.js` · `logout.js` · `change-password.js` · `request-account.js` | POST | still no `parseJsonBody` -- a literal JSON `null` body throws a bare 500 (bucket 2, unfixed) |
| `api/auth/session.js` | GET | public session-state check (T1.2) |
| `api/contact.js` | POST | pre-existing, untouched since before Phase 0 |
| `api/coach/students.js` | GET, POST | still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/students/[id].js` | PATCH | still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/requests.js` | GET | |
| `api/coach/requests/[id].js` | PATCH | still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/templates.js` | GET, POST | T2.0/T2.2: `parseJsonBody`; GET/POST include `capacity` (optional, `parseCapacity`-validated) |
| `api/coach/templates/[id].js` | PATCH | T2.2: **partial update** -- `{active}` and/or `{capacity}`, at least one required (no longer a hard boolean-`active` requirement) |
| `api/coach/sessions.js` | GET, POST | T2.0: `parseJsonBody`. GET returns `templatesForDay` + `sessions` for one date, both now include `capacity`. POST from a template does **not** copy capacity onto the session row. |
| `api/coach/sessions/[id].js` | GET, **PATCH (T2.2, new)** | GET adds `capacity`, `effectiveCapacity`, `attendanceSaved` (T2.5). PATCH (`parseJsonBody`-guarded) is the per-session capacity override, `{capacity}` only. |
| `api/coach/mark-attendance.js` | POST | writes a row for the **whole** roster, not just those present (deliberate); still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/next-class.js` | **GET (T2.4, new)** | `{nextClass: null \| {...}}`, the coach-dashboard headcount panel |
| `api/student/attendance.js` · `upcoming.js` | GET | `upcoming.js` rows now include `capacity`, `attending`, `full` (T2.3) |
| `api/student/rsvp.js` | POST | T2.0: refactored onto shared `parseJsonBody`. T2.3: capacity-enforced on `going:true` -- atomic `INSERT...SELECT...WHERE COUNT<capacity ON CONFLICT DO NOTHING`, **409** `{ok:false,error:'This class is full'}` when it doesn't fit |

## Non-obvious behaviours that have already cost a session

- **`sessions/[id].js`'s `status: r.status || 'absent'` coalesce is still there** (unchanged --
  raw status must round-trip exactly for the "reopen a saved session" guarantee), but T2.5 added
  a sibling field, `attendanceSaved` (`COUNT(*) FROM attendance WHERE session_id = ?` > 0), so
  the client *can* now tell a never-saved session from one saved all-absent, without changing
  what `status` itself means.
- **Every `session_rsvps` count is unfiltered, because today every row means "going"**
  (grepped 2026-08-07, complete): `student/rsvp.js:82` (the atomic insert's inner `COUNT(*)`),
  `student/upcoming.js:28` (grouped counts → `attending`/`full`), `coach/next-class.js:30`
  (the dashboard panel), `coach/sessions/[id].js:43` (T2.5 attendance pre-fill). The moment
  any row means something other than "going" — Phase 3's waitlist is the first — **all four
  must filter in the same commit** or a waitlisted student silently consumes a capacity slot,
  inflates the headcount, and arrives pre-marked present. Non-counting status-sensitive sites:
  `rsvp.js:46`, `:93` (existence checks), `:104` (the cancel DELETE).
- **`session_rsvps` is keyed `(template_id, session_date, user_id)`**, not to a `class_sessions`
  row — students RSVP before a session exists. One-off sessions (`template_id IS NULL`) can never
  have RSVPs, and therefore can never be capacity-limited either.
- **Effective capacity resolution rule (T2.2, used everywhere capacity is read)**:
  `COALESCE(class_sessions.capacity, class_templates.capacity)` for a template+date. The session
  row may not exist yet, and a session's capacity is **never copied** from its template at
  creation time -- a later template change flows through live to every session that hasn't set
  its own override. Full detail in `coach-student-system-technical.md`'s "Database schema".
- **`rsvp.js` validates in a deliberate 400-before-404 order**, pinned by a test. Window and
  day-of-week checks apply to creating an RSVP only, never to cancelling. T2.3 added capacity
  enforcement strictly *after* those checks, in the `going:true` branch only.
- **Two notions of "today" remain, both SAST-correct, deliberately duplicated** (T2.4 resolved
  the third): the server's `todayIso()`/`sastNowParts()` (`_utils/dates.js`) and the browser's
  `sastTodayIso()` (`public/app.js`) -- same fixed +2h offset, no build step to share an ES
  module with a plain `<script>`. `coach/attendance.html`'s old browser-*local*-timezone
  `todayLocalIso()` is gone. Plain UTC `new Date()` anywhere untouched by either helper is still
  a live third case if a future page reaches for it directly.
- **`fetchJson` never throws** since Phase 1's fix pass: on network/parse failure it returns
  `{ response: null, data: { ok:false, error:'Network error. Please try again.' } }`. Call sites
  use `response?.ok`. A `try/catch` around a `fetchJson` call is therefore dead code (found and
  removed from `coach/session.html` in Phase 2's review follow-up) -- watch for the same pattern
  creeping into future call sites.
- **Page scripts run synchronously** at the end of `<body>`; Phase 1 removed the hand-copied
  `DOMContentLoaded` wrappers from seven files.
- **Seven handlers still throw a bare 500 on a literal JSON `null` body** (everything in the verb
  table above still marked "no `parseJsonBody`"). T2.0 fixed four of the original ten
  (`templates.js`, `templates/[id].js`, `sessions.js`, plus `rsvp.js`'s pre-existing guard);
  `sessions/[id].js`'s new PATCH was built with `parseJsonBody` from the start. Logged in
  `TODO.md`; fixed file-by-file as phases open them.

## Migrations

`public/migrations/` — `0001_initial.sql`, `0002_session_rsvps.sql`,
`0003_class_capacity.sql` (adds nullable `capacity` to `class_templates` and
`class_sessions`; applied to production 2026-08-07, preceded by a fresh backup per T0.3).
Tracked via `migrations_dir` in `wrangler.jsonc`. Next number is `0004`.

## Static asset versions (bump on every change, every referencing page — `PLAN.md` rule 6)

`styles.css?v=4` · `app.js?v=2` (bumped in T2.4; all 12 pages). Check with
`grep -rn "app\.js?v=" public`.

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

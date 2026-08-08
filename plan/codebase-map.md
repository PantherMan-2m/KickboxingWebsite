# Codebase Map

Findings get recorded here as data, not re-derived each session — per `PLAN.md`'s "Keeping
sessions cheap" rule. Verified against the code on 2026-08-08, on branch `phase-4-payments`
(membership plans, payment recording, the overdue flag) before merge; migration `0005` is
local-only until T4.10. Update this file when the codebase's shape changes; do not let a
session re-grep for it.

## Page inventory (13 HTML pages, `public/`)

All 13 load `public/app.js` (a plain, non-`defer`red `<script>` placed immediately before
each page's own trailing inline `<script>`, at the end of `<body>` — see
`coach-student-system-technical.md`'s "Shared code" section for why the placement matters).

| Page | Header | Own script does |
|---|---|---|
| `index.html` | full nav (public: Classes/Schedule/Coaches/Pricing/Gallery/Login) | `script.js`: contact form + header-hide-on-scroll + login/dashboard swap |
| `login.html` | logo-only | login form submit |
| `change-password.html` | logo-only | change-password form submit |
| `request-account.html` | logo-only | request-account form submit |
| `coach/dashboard.html` | full nav (coach) | Phase 2 T2.4: next-class panel (`GET /api/coach/next-class`), now with a waitlist count (T3.7) |
| `coach/attendance.html` | full nav (coach) | date picker (now `sastTodayIso()`-based), template suggestions, one-off session form |
| `coach/requests.html` | full nav (coach) | pending-request list, approve/reject |
| `coach/session.html` | full nav (coach) | roster load/save with RSVP pre-fill (T2.5), capacity-override form (T2.2), back-link to attendance with date, separate waitlist list below the roster (T3.7), payment-status badge on both lists (T4.6) |
| `coach/students.html` | full nav (coach) | roster list, add student, activate/deactivate, search + status filter (T2.6), current-plan column + assign/change-plan dialog (T4.4) |
| `coach/templates.html` | full nav (coach) | weekly-schedule list + capacity field (T2.2), add template |
| `coach/payments.html` | full nav (coach) | **new, T4.5**: record-a-payment form, recent-payments ledger, membership-plan catalogue editor (add plan / toggle active) |
| `student/dashboard.html` | full nav (student) | attendance history load, plus a "My membership" panel (own plan, effective price, status badge, payment history — T4.7) |
| `student/upcoming.html` | full nav (student) | upcoming-classes list, three-state RSVP button: not booked / going / waitlisted-with-position (T2.3 capacity, T3.6 waitlist) |

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
│   │   ├── dates.js                # isValidDate, dayOfWeekFor, todayIso, addDaysIso, RSVP_WINDOW_DAYS, sastNowParts (T2.4), dayLabelFor (T3.4)
│   │   ├── email.js                # Resend wrapper
│   │   ├── body.js                 # T2.0: parseJsonBody(context)
│   │   ├── capacity.js             # T2.2: parseCapacity(value)
│   │   ├── schedule.js             # T2.4: expandTemplates(), selectNextClass()
│   │   ├── waitlist.js             # T3.1/T3.4: promoteWaitlist(), waitlistPosition(), waitlistCount(), promoteAndNotify() -- untouched by Phase 4
│   │   ├── notify.js               # T3.3: buildEvent(), notifyCoach(), notifyStudent()
│   │   ├── plans.js                # T4.3: parsePriceCents(), parseAllowance(), parsePeriod()
│   │   └── payments.js             # T4.2: PAYMENT_GRACE_DAYS, effectivePriceCents(), paymentStatusForRoster() -- one batch query, D4/D6
│   ├── auth/                       # no middleware -- public by construction
│   │   ├── login.js
│   │   ├── logout.js
│   │   ├── change-password.js
│   │   ├── request-account.js
│   │   └── session.js              # T1.2, public session-state check
│   ├── coach/
│   │   ├── _middleware.js
│   │   ├── students.js             + students/[id].js + students/[id]/membership.js (T4.4)
│   │   ├── requests.js             + requests/[id].js
│   │   ├── templates.js            + templates/[id].js
│   │   ├── sessions.js             + sessions/[id].js
│   │   ├── mark-attendance.js
│   │   ├── next-class.js           # T2.4: GET, the coach-dashboard headcount panel's endpoint
│   │   ├── plans.js                + plans/[id].js       # T4.3: membership plan catalogue
│   │   └── payments.js             # T4.5: GET (list, ?userId= filter) / POST (record)
│   └── student/
│       ├── _middleware.js
│       ├── attendance.js
│       ├── upcoming.js
│       ├── rsvp.js
│       └── payments.js             # T4.7: GET, own plan/status/history only -- no id parameter accepted
```

## HTTP verb inventory (grepped 2026-08-08, complete, post-Phase-4)

| Route file | Verbs | Notes worth knowing before you edit it |
|---|---|---|
| `api/auth/login.js` · `change-password.js` · `request-account.js` | POST | still no `parseJsonBody` -- a literal JSON `null` body throws a bare 500 (bucket 2, unfixed) |
| `api/auth/logout.js` | POST | no body parsed at all -- not part of the unguarded-handlers list |
| `api/auth/session.js` | GET | public session-state check (T1.2) |
| `api/contact.js` | POST | pre-existing, untouched since before Phase 0 |
| `api/coach/students.js` | GET, POST | GET now also returns each student's current plan (`planId`/`planName`/`priceOverrideCents`/`planPriceCents`) via one LEFT JOIN, not a per-row lookup (T4.4). POST still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/students/[id].js` | PATCH | T4.4: now `parseJsonBody`-guarded (discharged from the unguarded list) |
| `api/coach/students/[id]/membership.js` | **POST (T4.4, new)** | `{plan_id,start_date,price_override_cents?}` -- assigns/changes a membership; 400 on a `period='session'` plan (D2); closes any existing open row to the day before the new `start_date` in the same request |
| `api/coach/requests.js` | GET | |
| `api/coach/requests/[id].js` | PATCH | still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/templates.js` | GET, POST | T2.0/T2.2: `parseJsonBody`; GET/POST include `capacity` (optional, `parseCapacity`-validated) |
| `api/coach/templates/[id].js` | PATCH | T2.2: **partial update** -- `{active}` and/or `{capacity}`, at least one required (no longer a hard boolean-`active` requirement). T3.5: on a capacity change, calls `promoteAndNotify` for every future date (today..`RSVP_WINDOW_DAYS`) that has a waitlisted row (one grouped `DISTINCT` query, not a loop) -- a template capacity change affects every date it expands to. |
| `api/coach/sessions.js` | GET, POST | T2.0: `parseJsonBody`. GET returns `templatesForDay` + `sessions` for one date, both now include `capacity`. POST from a template does **not** copy capacity onto the session row. |
| `api/coach/sessions/[id].js` | GET, **PATCH (T2.2, new)** | GET adds `capacity`, `effectiveCapacity`, `attendanceSaved` (T2.5), a separate `waitlist` array (T3.7, queue order), and (T4.6) `paymentStatus: 'paid'\|'overdue'\|'none'` on **every row of both** `roster` and `waitlist` -- one additional batch query (`paymentStatusForRoster`), not one per student; the query count does not scale with roster size. PATCH (`parseJsonBody`-guarded) is the per-session capacity override, `{capacity}` only; T3.5: `UPDATE...RETURNING template_id, session_date` then calls `promoteAndNotify` for that one date. |
| `api/coach/mark-attendance.js` | POST | writes a row for the **whole** roster, not just those present (deliberate); still no `parseJsonBody` (bucket 2, unfixed) |
| `api/coach/next-class.js` | **GET (T2.4, new)** | `{nextClass: null \| {...}}`, the coach-dashboard headcount panel; T3.7 adds `waitlisted` (total count) |
| `api/coach/plans.js` | **GET, POST (T4.3, new)** | list/create membership plans; `price_cents` a non-negative integer, `allowance_per_period` null-or-positive-integer, `period` set at creation |
| `api/coach/plans/[id].js` | **PATCH (T4.3, new)** | partial update (`name`/`price_cents`/`allowance_per_period`/`active`); `period` is immutable -- present in the body is a 400, not a silent no-op |
| `api/coach/payments.js` | **GET, POST (T4.5, new)** | GET: `?userId=` optionally filters; POST: records a payment, `recorded_by` always from the session |
| `api/student/attendance.js` | GET | |
| `api/student/upcoming.js` | GET | rows include `capacity`, `attending` (`status='going'` count), `full` (T2.3); T3.6: `rsvpStatus` (`null\|'going'\|'waitlisted'`) + `waitlistPosition`, and `going` now strictly means `rsvpStatus==='going'` (previously "has any row" -- a bug T3.0 deliberately left unfiltered and flagged for T3.6) |
| `api/student/rsvp.js` | POST | T2.0: refactored onto shared `parseJsonBody`. T2.3: capacity-enforced on `going:true` -- atomic `INSERT...SELECT...WHERE COUNT(status='going')<capacity ON CONFLICT DO NOTHING`. **T3.2: the old 409 is gone.** A full class waitlists instead of rejecting -- `{ok:true, status:'going'\|'waitlisted', position?}`. Cancelling (`going:false`) is `DELETE...RETURNING status`; a `going` row freed calls `promoteAndNotify` (T3.1/T3.4), a `waitlisted` row does not. T3.4: a genuinely new waitlisted row (insert `changes===1`) fires one `waitlist_joined` to the coach. Payment status has no bearing anywhere in this file (T4.6/D5). |
| `api/student/payments.js` | **GET (T4.7, new)** | own plan (effective price), own `status`, own payment history -- derives the user from the session only; accepts no id parameter of any kind (IDOR-proof by construction, not by a check) |

## Non-obvious behaviours that have already cost a session

- **`sessions/[id].js`'s `status: r.status || 'absent'` coalesce is still there** (unchanged --
  raw status must round-trip exactly for the "reopen a saved session" guarantee), but T2.5 added
  a sibling field, `attendanceSaved` (`COUNT(*) FROM attendance WHERE session_id = ?` > 0), so
  the client *can* now tell a never-saved session from one saved all-absent, without changing
  what `status` itself means.
- **T3.0: every `session_rsvps` count now filters `status = 'going'`** (fixed in the same
  commit as the migration that added the column, per the rule below): `student/rsvp.js`'s
  atomic insert's inner `COUNT(*)`, `student/upcoming.js`'s grouped counts →
  `attending`/`full`, `coach/next-class.js`'s dashboard panel, `coach/sessions/[id].js`'s
  T2.5 attendance pre-fill. **If you ever see an unfiltered `COUNT(*)`/`SELECT` against
  this table reintroduced, it's a bug** -- a waitlisted row must never consume a capacity
  slot, inflate a headcount, or arrive pre-marked present. Non-counting status-sensitive
  sites, deliberately unfiltered (they need to find a row regardless of status, for logic
  rather than counting): `rsvp.js`'s existing-row check and its ambiguous-`changes`
  re-check, and the cancel `DELETE`. Grep to re-verify: `grep -rn "FROM session_rsvps"
  public/functions` -- every hit either filters on `status` or is one of the three named
  above.
- **Promotion is centralized**: `_utils/waitlist.js`'s `promoteWaitlist()` is the only
  place that decides who gets promoted (one atomic `UPDATE...WHERE user_id IN (SELECT...
  ORDER BY created_at, user_id LIMIT...)`, so concurrent callers can't over-promote and a
  `going` row is never demoted). `promoteAndNotify()` wraps it with the T3.4 notification.
  Four call sites: `rsvp.js`'s cancel path, `rsvp.js`'s full-class join path (closes the
  race window), and the two capacity-PATCH endpoints (T3.5). A new write path that can
  free or add a spot must call `promoteAndNotify`, not reimplement the query.
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
- **Six handlers still throw a bare 500 on a literal JSON `null` body** (everything in the verb
  table above still marked "no `parseJsonBody`"). T2.0 fixed four of the original ten
  (`templates.js`, `templates/[id].js`, `sessions.js`, plus `rsvp.js`'s pre-existing guard);
  `sessions/[id].js`'s new PATCH was built with `parseJsonBody` from the start; T4.4 fixed
  `students/[id].js` while that file was open for the membership-assignment work. Logged in
  `TODO.md`; fixed file-by-file as phases open them.
- **D1 (Phase 4): money is integer cents everywhere on the server** (`price_cents`,
  `amount_cents`, `price_override_cents`), never a float or a formatted string. Rand
  formatting (`formatRands`, `app.js`) happens only in the browser, at display time. If
  you ever see a monetary value multiplied/divided by 100 anywhere server-side, that's a
  bug -- the server never sees Rands at all.
- **D4 (Phase 4): the overdue flag is computed on every read, never stored.** There is no
  `is_overdue` column and no cron job -- `_utils/payments.js`'s `paymentStatusForRoster`
  derives it fresh from `memberships`/`payments` each time `coach/sessions/[id].js`'s GET
  runs. If a future change makes this expensive enough to want caching, the cache must be
  invalidated on every `payments` insert and every `memberships` write, which is most of
  why it hasn't been cached.

## Migrations

`public/migrations/` — `0001_initial.sql`, `0002_session_rsvps.sql`,
`0003_class_capacity.sql` (adds nullable `capacity` to `class_templates` and
`class_sessions`; applied to production 2026-08-07, preceded by a fresh backup per T0.3),
`0004_rsvp_status.sql` (adds `session_rsvps.status TEXT NOT NULL DEFAULT 'going'` + an
index on `(template_id, session_date, status, created_at)`; applied to production
2026-08-07, preceded by a fresh backup, `wrangler d1 migrations list --remote` confirmed
zero pending and `SELECT COUNT(*) FROM session_rsvps WHERE status <> 'going'` returned 0
before the deploy), `0005_memberships_payments.sql` (adds `membership_plans`,
`memberships`, `payments` -- see `coach-student-system-technical.md`'s "Database schema"
for column-by-column detail; seeds the three fixed-id plans `plan_dropin`/`plan_weekly`/
`plan_unlimited`; applied to production in T4.10, preceded by a fresh backup per T0.3).
Tracked via `migrations_dir` in `wrangler.jsonc`. Next number is `0006`.

## Static asset versions (bump on every change, every referencing page — `PLAN.md` rule 6)

`styles.css?v=5` · `app.js?v=3` (both bumped in T4.8 -- badge CSS for the payment-status
flag, `formatRands()` added to `app.js`; all 13 pages, including the new
`coach/payments.html`). Check with `grep -rn "app\.js?v=" public`.

## Notification env vars (T3.3/T3.8)

`COACH_NOTIFY_EMAIL`, `COACH_WEBHOOK_URL`, `COACH_WEBHOOK_SECRET` -- read by
`_utils/notify.js`, alongside the pre-existing `RESEND_API_KEY`. `public/.dev.vars`
(gitignored, T3.8) holds the three new names **left empty** locally, so `npm run dev`
and the test suite always exercise the no-op path.

**Production values are set via `wrangler`, not the dashboard.** This project's Pages
Variables UI (Settings → Environment variables) is disabled ("managed through
wrangler.toml" -- a consequence of `pages_build_output_dir` in `wrangler.jsonc`).
`wrangler pages secret put` still works, via the API directly:
```bash
printf '%s' 'info@cjnacademy.com' | wrangler pages secret put COACH_NOTIFY_EMAIL --project-name=kickboxingwebsite
```
The real Cloudflare Pages project name is `kickboxingwebsite` -- **not**
`cjn-academy-website`, the unrelated `"name"` field in `public/wrangler.jsonc`. Confirm
with `wrangler pages project list` / `wrangler pages secret list --project-name=...`
(values are write-only, Encrypted). `COACH_NOTIFY_EMAIL` is set as of T3.8; `RESEND_API_KEY`
was already present. `COACH_WEBHOOK_URL`/`COACH_WEBHOOK_SECRET` are unset (email-only).

## Database schema (9 tables)

`users`, `sessions` (login sessions, not class sessions), `class_templates`,
`class_sessions`, `attendance`, `session_rsvps`, `membership_plans`, `memberships`,
`payments` (the last three added by `0005`, Phase 4). Full column-level detail in
`coach-student-system-technical.md`'s "Database schema" section — not duplicated here,
since this map is structural (what exists and where), not explanatory (why/how).

## Local dev tooling (outer folder, all tracked since `f0c3ec8`)

`scripts/lib/devEnv.js` (shared config/wrangler-spawning), `scripts/dev-server.js`,
`scripts/db-reset-seed.js`, `test/unit/`, `test/integration/`, `test/helpers/`. Detail in
`coach-student-system-technical.md`'s "Local development environment" and "Automated
tests" sections.

### `public/.wrangler/` layout (verified 2026-08-07 — read this before deleting anything)

Gitignored by `.gitignore:3`'s `.wrangler/` (no leading slash, so it matches at any depth;
`git check-ignore -v public/.wrangler/tmp` confirms). **No `.gitignore` change is needed
and a redundant `public/.wrangler/` line should not be added.** Three subdirectories, and
they are *not* equally disposable:

| Path | What it is | Safe to delete? |
|---|---|---|
| `tmp/` | one `bundle-*` dir per `wrangler pages dev` start; accumulates forever (673 dirs / 87 MB by 2026-08-07) | **Yes** — pure litter, noisy in filesystem greps |
| `state/v3/d1` | **the local D1 database** the test suite and `npm run dev` run against (47 MB) | **No** — deleting it discards local data and forces `npm run db:reset` |
| `cache/`, `state/{cache,observability,workflows}` | wrangler's own caches | Yes, but no benefit |

So the cleanup command is `rm -rf public/.wrangler/tmp`, never `rm -rf public/.wrangler`.

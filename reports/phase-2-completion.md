# Phase 2 Completion Report

Branch `phase-2-capacity`, merged to `main` as `ac9d39f` (merge commit, `--no-ff`) and
pushed 2026-08-07. Migration `0003_class_capacity.sql` applied to production the same
day, preceded by a fresh backup (`backups/cjn-academy-2026-08-07.sql`, gitignored).
9 feature/fix commits + 1 doc commit on the branch, squashed into one merge commit on
`main`. Full suite: 86/86 at merge time.

---

## T2.0 — `parseJsonBody` helper

**Exit condition**: literal JSON `null` → 400 (not 500) on every adopted route; `rsvp.js`'s
existing null-body test unchanged; suite green.

**Evidence**: `test/integration/parse-json-body.test.mjs` — 3 new tests, one per newly
adopted route (`coach/templates.js` POST, `coach/templates/[id].js` PATCH,
`coach/sessions.js` POST), each asserting `res.status === 400` for `body: 'null'`. All 3
passed. `rsvp.js`'s pre-existing null-body test (`test/integration/rsvp.test.mjs`)
unchanged and still green. Full suite after this task: 55/55 (up from 52).

---

## T2.1 — Capacity schema migration

**Exit condition**: applies cleanly to a fresh seed AND a DB restored from a T0.3 export;
`migrations list` pending→applied both ways; existing tests pass.

**Evidence**: verified locally two ways before any production write —
1. Fresh seed: `npm run db:reset` (applies `0001`-`0003`), then
   `wrangler d1 migrations list cjn-academy --local` → `✅ No migrations to apply!`.
   `PRAGMA table_info` confirmed both `capacity` columns present, nullable INTEGER.
2. Restored DB: wiped local D1, restored `backups/cjn-academy-2026-08-05.sql` (the real
   production export from Phase 0/1, pre-`0003` schema), reconciled `0001`/`0002` into
   `d1_migrations` the same way Phase 0 reconciled production, then
   `wrangler d1 migrations apply cjn-academy --local` applied only `0003`. User count
   unchanged (2 before/after), capacity columns read back `null` on every existing row.

Full suite: 55/55 unaffected.

---

## T2.2 — Capacity management API and UI

**Exit condition**: persist/reload/clear on templates; live inheritance vs. session
override; validation table (non-numeric/negative/zero/non-integer rejected); PATCH
partial-update semantics (neither field → reject, either alone → succeeds without
disturbing the other).

**Evidence**: `test/integration/capacity.test.mjs`, 6 tests (later extended to 7 checks
in the review follow-up — see below), all passing:
- capacity set on `seed-template-fri` → persists on GET → cleared via `''` → reads back
  `null`.
- session created from `seed-template-mon` (capacity 20, no override) → `effectiveCapacity: 20`;
  template changed to 25 afterwards → session reports 25 without re-creating it (live,
  not copied); session override to 12 → session reports 12, template still reports 25.
- POST/PATCH/session-PATCH each rejected `'abc'`, `-5`, `0`, `12.5` with 400 + error message.
- PATCH with neither field → 400; capacity-only PATCH left `active` untouched and
  vice versa (asserted by re-fetching after each).

Manual browser walkthrough (`coach/templates.html`, `coach/session.html`): set Monday's
template capacity to 18 via the row input, confirmed it round-tripped on reload; created
a session from that template, confirmed "Capacity: 18" on the session page; overrode it
to 12, confirmed the display updated to "Capacity: 12" *and* that an in-progress
(unsaved) attendance radio selection survived the capacity save (`refreshCapacityMeta()`
deliberately doesn't touch the roster). Full suite: 61/61.

---

## T2.3 — Enforce capacity on RSVP

**Exit condition**: capacity 2 + two RSVPs → third gets 409, no row written; the two in
can cancel/re-RSVP; idempotent re-RSVP on a full class still returns `ok:true`; NULL
capacity stays unlimited; concurrent race for one spot produces exactly one row; the
student page shows "Full" + disabled control for a non-going student.

**Evidence**: `test/integration/rsvp-capacity.test.mjs`, 3 tests (extended to 5 in the
review follow-up):
- Capacity 2, 3 students (2 seeded + 1 test-only, since only `active1`/`active2` are
  usable without side effects on other seeded accounts) → third RSVP: `409`,
  `{ok:false,error:'This class is full'}`, row count verified `2` via direct
  `SELECT COUNT(*)`. Re-RSVP by an already-in student: `200 {ok:true}`, row count still
  `2`. Cancel → row count `1`. Re-RSVP → `2`. Cancel a different student, previously
  -rejected student retries → `200`.
- NULL-capacity template (`seed-template-wed`, never touched) accepted 3/3 RSVPs.
- `Promise.all` of two concurrent RSVPs for one remaining spot on a capacity-2 class →
  statuses sorted `[200, 409]`, row count exactly `2`. A fourth, non-participating
  "observer" account's `GET /api/student/upcoming` showed `capacity:2, attending:2,
  full:true, going:false` for that class.

Manual browser walkthrough (`student/upcoming.html`): capacity 1, `active1` RSVP'd →
"0 left" / "Going ✓ (tap to cancel)"; `active2` (not going) saw "Full" with the button
`disabled: true` confirmed via `document.querySelectorAll(...).disabled`. Full suite: 64/64.

---

## T2.4 — Next-class panel on the coach dashboard

**Exit condition**: correct next class across mid-week/later-today/week-rollover/00:30-SAST
scenarios; attending count matches direct `COUNT(*)`; unlimited shows "N going" not
"N/null"; empty state; `upcoming.js` refactor behaviour-preserving.

**Evidence**: `test/integration/upcoming.test.mjs` written and passed **against the
pre-refactor code** first (pinning window + exact sorted templateId/date list), then
re-run unchanged after extracting `expandTemplates()` — same pass. `test/unit/schedule.test.mjs`,
9 tests on the pure `selectNextClass`/`expandTemplates` functions, including:
"excludes a class today that already started, but keeps one later today"; "rolls a class
whose day already happened this week to the end of the window"; and "does not show a
class that already finished yesterday, using SAST not UTC" (00:30 SAST simulated via
`sastNowParts(new Date('2026-08-04T23:30:00Z'))` → date `2026-08-05`, Monday correctly
excluded). `test/integration/next-class.test.mjs`, 3 tests against real seed data:
next-class matched an independent `selectNextClass` computation; attending count matched
`COUNT(*)` after an RSVP; deactivating all templates produced `nextClass: null`.

Manual browser walkthrough: dashboard showed "Kids Class · 2026-08-07 · 17:30-18:30 · 0
going" (today being Thursday, Mon/Wed already passed this week — confirms the rollover);
after setting capacity 5 and one RSVP, panel updated to "1 / 5 going (4 spots left)";
deactivating all templates showed "No classes scheduled in the next 7 days."
`coach/attendance.html`'s date default confirmed via
`sastTodayIso.toString()` containing no `getTimezoneOffset` call — structurally
timezone-independent, not just empirically so at one browser setting. Full suite: 80/80.

---

## T2.5 — Pre-fill attendance from RSVPs

**Exit condition**: never-saved session pre-fills present from RSVP; saved-absent beats
RSVP-going on reopen (the central regression); opening-without-saving writes zero rows;
one-off session always defaults absent.

**Evidence**: `test/integration/attendance-prefill.test.mjs`, 4 tests:
- Never-saved session from a template: `attendanceSaved:false`, RSVP'd student
  `going:true`, others `going:false`, all `status:'absent'` (raw, pre-fill is
  client-side only).
- Opened (GET) but not saved → direct `SELECT COUNT(*) FROM attendance` = `0`.
- Saved with the RSVP'd student marked absent → reopened: `attendanceSaved:true`,
  `going:true` still (RSVP unrelated to what was saved), `status:'absent'` (saved state
  wins).
- One-off session (`templateId:null`): every roster entry `going:false`, `status:'absent'`.

Manual browser walkthrough: created a session from `seed-template-mon` with `active1`
RSVP'd → roster loaded with Alice Active's radio pre-checked to "present", everyone else
"absent". Manually changed Alice to "absent", saved, reloaded the page fresh →
confirmed her radio was "absent" with "✓ Going" still shown in the RSVP column (saved
state visibly overriding the pre-fill). Full suite: 84/84.

---

## T2.6 — Roster search and filter

**Exit condition**: case-insensitive name/email filter; clearing restores all; status
filter composes; empty state; works at mobile width inside `.scroll-x`.

**Evidence**: no server change, so verified entirely via browser (dispatched real
`input`/`change` events, read the rendered `#rosterBody` back):
- Typing "active" on the 6-student seed roster matched "Alice Active", "Bob Active", and
  "Ivy Inactive" (substring match — "inactive" contains "active" — confirms it's a plain
  substring search, not a prefix match).
- Clearing the box restored all 6 rows.
- Search "active" + status filter "inactive" composed to show only "Ivy Inactive" (the
  intersection, not either filter alone).
- Search for a non-matching string rendered "No matching students." (distinct from the
  "No students yet." empty-roster message).
- At 375px viewport: `getComputedStyle('.scroll-x').overflowX === 'auto'`, the table
  (`scrollWidth: 480`) confirmed inside it and wider than the viewport
  (`clientWidth: 375`), while the search input and status filter (outside `.scroll-x`)
  stayed fully visible and functional — typing "bob" at that width still filtered
  correctly.

Full suite: unaffected by this task (client-only), 84/84.

---

## Review follow-up (uncommitted fixes applied and committed at the start of T2.7)

Three fixes requested after the initial T2.0-T2.6 pass, applied on the branch before
T2.7 began (commit `45e86e8`):

1. **`student/rsvp.js`** — the capacity-limited `INSERT...SELECT` now carries
   `ON CONFLICT (template_id, session_date, user_id) DO NOTHING`. Without it, a
   double-submitted RSVP (two near-simultaneous requests from the same user racing the
   earlier existing-row check) would hit the row's own PK constraint and throw an
   uncaught error instead of responding gracefully. `meta.changes === 0` is now
   ambiguous between "full" and "already existed", so a re-query of the user's own row
   disambiguates. New tests: "a double-submitted RSVP on a capacity-limited class
   returns ok twice and writes exactly one row" and "a genuinely full class still
   returns 409 after the ON CONFLICT DO NOTHING fix" — both passing.
2. **`_utils/capacity.js`** — `parseCapacity` now rejects by `typeof` before coercing,
   since `Number(true) === 1` and `Number([1]) === 1` previously passed validation as a
   capacity of 1. Extended the template-PATCH validation test with `true`, `[1]`, `{}`
   (all now rejected) and a `null`-vs-`''` check (both accepted, both clear to
   unlimited) — passing.
3. **`coach/session.html`** — removed a dead `catch` around a `fetchJson` call
   (`fetchJson` never throws, per `plan/phase-2.md`'s fact #2), matching
   `coach/templates.html`'s `try/finally`-only shape. No new test needed (pure
   structural change; existing behavioural tests cover it).

Full suite after these fixes: **86/86**, re-confirmed on the merged `main` branch before
push.

---

## T2.7 — Review, production rollout, and documentation

Independent review (step 1) was completed and its findings folded in before this report
was written (the three fixes above). Steps 2-6 executed this session, all `[HUMAN GATE]`
steps explicitly confirmed by Giovanni before running:

1. **Backup** (confirmed): `wrangler d1 export cjn-academy --remote --output backups/cjn-academy-2026-08-07.sql`.
   First attempt failed with a Cloudflare API auth error (`code: 10000`) on the export
   endpoint specifically, despite a valid-looking OAuth token; Giovanni ran `wrangler
   login` to refresh it, retry succeeded. File confirmed: 9,890 bytes, 100 lines,
   gitignored (`git check-ignore -v` confirmed), never staged.
2. **Migration** (confirmed): `wrangler d1 migrations apply cjn-academy --remote` applied
   `0003_class_capacity.sql`. `wrangler d1 migrations list --remote` afterward: `✅ No
   migrations to apply!`. Schema verified via `PRAGMA table_info` on both tables
   (nullable INTEGER `capacity` present). Row counts (`users:2, attendance:1,
   sessions:3, templates:3`) matched the pre-migration backup's `INSERT` counts exactly
   — zero data touched by a schema-only migration.
3. **Asset versions**: `grep -rn "app\.js?v=" public` — all 12 pages on `?v=2`, zero
   matches for `?v=1`. `styles.css?v=4` unchanged (not touched this phase).
4. **Merge, push, deploy** (confirmed): merged locally (`--no-ff`), re-ran full suite on
   merged `main` (86/86) before pushing. `git push origin main` →
   `2dd4d2d..ac9d39f main -> main`. `wrangler pages deployment list` confirmed
   `ac9d39f` as the **Active** Production deployment within ~2 minutes of the push.
5. **Live verification**:
   - Public smoke test: homepage loads, `app.js?v=2` served (200), `/api/coach/next-class`
     live and correctly gated (`401 {ok:false,error:'Not logged in'}`, not 404).
   - Historical-attendance spot-check: the one pre-existing `attendance` row (session
     `280eaf09-...`, user `7542599b-...`) read back byte-identical to the pre-migration
     backup — `status:'present'`, same `marked_by`/`marked_at` — and the session's new
     `capacity` column reads `NULL` as expected.
   - Authenticated checks (next-class panel showing real data; setting a real capacity
     persisting) done by Giovanni directly against production, since I don't hold his
     login credentials and won't request them. Confirmed by him: "both look good."

**Discrepancies from `plan/phase-2.md`**: none of substance. The plan's `T2.0`
description of `parseJsonBody`'s exact return shape ("a discriminated result") was
implemented as `{ok, body}` rather than a response object — a minor interpretation, not
a deviation from intent. Everything else (resolution rule, 409 semantics, `sastNowParts`
signature, `expandTemplates`/refactor-before-test ordering) matched the amended spec as
written. The one real surprise was operational, not code-level: the Cloudflare D1
export API rejected a token that `wrangler whoami`-equivalent output showed as valid,
requiring an interactive `wrangler login` refresh — worth remembering if a future
backup ever fails the same way.

# Build Plan — CJN Academy Website

**Authored**: 2026-08-05 (planning session, Opus 5)
**Intended executor**: Sonnet 5, one task at a time, in dependency order.
**Companion docs**: `HANDOVER.md` (session continuity), `TODO.md` (loose ends),
`public/docs/coach-student-system.md` (living technical reference — update it as phases land).

---

## How to use this document

Read this section before executing anything.

1. **Tasks are executed in dependency order.** Every task lists `Depends on`. A task may not
   begin until every dependency's exit condition has been met and verified. Where tasks have
   no dependency relationship they may be done in any order, but prefer numeric order.
2. **Exit conditions are literal.** A task is done when its exit condition is *demonstrated*,
   not when the code looks right. If an exit condition cannot be demonstrated, the task is not
   done — stop and report, do not proceed to the next task.
3. **`[HUMAN GATE]` tasks require Giovanni's explicit confirmation** before the action runs.
   These are: anything writing to production D1, anything pushing to the remote, and anything
   touching live Cloudflare settings. Present the exact command and wait.
4. **Never `--remote` without a current backup.** See T0.3. This is not negotiable once payment
   records exist.
5. **Version-stamp every cacheable static asset, and bump it on every change**, on every page
   that references it. Today that means `styles.css?v=`; from T1.1 it also means `app.js?v=`.
   Cloudflare serves the HTML with `max-age=0` but gives static assets a 4-hour browser cache,
   so an unversioned asset means a bad deploy is unfixable for four hours across every page at
   once. This has caused stale-CSS incidents twice already (`1d102bd`).
6. **Work on a feature branch per phase** (`phase-1-shared-frontend`, etc.), not directly on
   `main`. This is a change from the Phase 1–3 convention; see T0.7.

### Conventions inherited from the existing codebase

Do not "improve" these without raising it first — they are deliberate:

- No build step, no bundler, no npm dependencies in the deployed site. Workers-native APIs only.
- **Git repo root is the outer project folder** (moved from `public/` in `f0c3ec8`, Phase 0).
  The deployed site is `public/`; Pages Functions live in `public/functions/`; Cloudflare Pages'
  **Root directory** setting is `public`. `scripts/`, `test/`, `reports/`, and `package.json`
  are tracked; `backups/` is gitignored and must never be staged — it holds real user data.
- Underscore-prefixed folders (`_utils`) are excluded from Pages routing but are importable.
- All auth failures return an identical generic 401 — do not add specific error messages.
- Commit messages are prefixed `feat:` / `fix:` / `chore:` / `docs:`.

---

## Execution model

Decided 2026-08-05. This plan was authored by Opus 5 and is intended for execution by Sonnet 5.

**Run Sonnet as the main session, not as a subagent.** Opus *can* spawn Sonnet subagents, but
subagent work is hidden from the user — the final report isn't surfaced by default, and each
spawn starts cold and re-derives context. For a solo developer watching a refactor touch every
page of a live site, a visible Sonnet session pointed at this file is cheaper and reviewable.
This document is written to be picked up by a fresh session with no prior conversation.

**One agent at a time. Do not split by layer.** A backend agent and a frontend agent were
considered and rejected: nearly every task here is a vertical slice (T2.2 is one migration, one
endpoint, and one HTML page), so a layer split means two context-isolated agents negotiating an
API contract mid-feature while writing to the same repo. The codebase is ~20 files with no build
step and no layer boundary worth enforcing.

**Opus plans; Sonnet executes. This is a hard split** (adopted 2026-08-05). An Opus session
authors and amends this document, runs checkpoint reviews, triages `/code-review ultra`
findings, verifies claims against the code, and writes task specs. It does **not** edit code,
merge, migrate, deploy, run smoke tests, or walk through dashboard settings — all of that goes
to a Sonnet session as a self-contained prompt. The Phase 0 checkpoint drifted into doing a git
restructure and Cloudflare configuration interactively, which was well within Sonnet's range
and consumed the context reserved for planning Phase 1. If a task turns out to be execution,
write it up and hand it over rather than doing it.

**Opus checkpoints at phase boundaries, not per task.** Per-task supervision would be redundant
— exit conditions here are deliberately literal and self-checkable (`npm test` passes, grep
returns zero, `migrations list` shows zero pending). Sonnet verifies those unaided. Opus is for
the judgmental questions at the seams:

- Did the phase deliver a foundation that genuinely works, or one that merely passes its own tests?
- Does what we learned change the phases that follow?
- Is the next phase still the right next phase, and what is its full task detail?

That is roughly four or five checkpoints across the whole program, and it is why Phases 3–9 are
deliberately under-specified — they get detailed with fresh information, not guessed at now.

**Completion reports are mandatory and must contain evidence.** At the end of each phase, write
`reports/phase-N-completion.md` (outer folder, not the repo) recording, for every task: the
exit conditions, and the **actual command output or observed result** that demonstrates each one
— not a claim that it passed. Where a task required showing a test failing before a fix (T0.6b),
include both the before and after output. Note anything that turned out differently from how
this plan described it; that discrepancy list is the most valuable part of the report, because
it is what re-plans the following phases.

A checkpoint reviewer is expected to **spot-check the report against reality** rather than
accept it. A report that cannot be independently reproduced means the phase is not complete.

### Triaging review findings

`/code-review ultra` output is **triaged before anything is fixed**, never fixed as it arrives.
Findings interact (three often share one root cause), and some are wrong. Sort into four buckets:

1. **Real bug in this phase's work** → fix now, on this branch.
2. **Real bug, pre-existing, outside this phase** → log to `TODO.md` or the phase that owns it.
   Do not expand the branch. This is the bucket that quietly wrecks phases.
3. **Deliberate decision the reviewer lacked context for** → reject; consider whether the docs
   should state it more loudly.
4. **Style preference** → decline. This codebase's conventions are the project's, not the
   reviewer's.

**Bucket 3 candidates specific to this codebase** — all deliberate, all documented in
`coach-student-system.md`, none of them defects: identical generic 401s on every login failure
(user-enumeration protection); the session cookie being unsigned (the DB lookup is the source of
truth); attendance writing rows for the whole roster rather than only those present; un-RSVP
deleting the row instead of storing a "not going" state; `session_rsvps` keyed to template+date
rather than a session id; the 14-day fixed session TTL with no sliding renewal; and "no CSRF
protection" (largely a false positive — `SameSite=Lax` blocks cookies on cross-site POSTs).

**Rank by damage to the phase's purpose, not by nominal severity.** A test that cannot fail, or
a suite that could silently run against the wrong database, outranks a more severe bug in
shipped code — because until the safety net is trustworthy, the evidence that anything *else*
got fixed is worth nothing.

**Verify counterintuitive claims empirically rather than by reasoning.** A confident "this closes
the whole bug class" survived two review passes in Phase 0 and was false; a ten-line script
settled it. See `reports/phase-0-checkpoint-review.md`.

**Re-derive every finding's status from the code, never from the fix summary.** Before a phase
branch merges, each review finding is re-checked against the file and line it names, and the
`file:line` inspected is recorded alongside the verdict. Three status claims on the Phase 0
branch failed this check — a "closes the whole bug class" comment that was false, a completion
report that misstated its own branch history, and a Confirmed, severity-ranked finding that
vanished from the fix summary without ever being fixed. Each was caught by someone re-reading
the code; none were caught by the process that produced the claim. The root cause is structural,
not carelessness: the agent that does the work also writes the report, so the report drifts from
the code. A summary is an input to this check, never a substitute for it. See
`reports/phase-0-review-triage.md` for the worked example.

**Before merging a phase branch**, `/code-review ultra` gives an independent multi-agent review
without the bias of the agent that wrote the code. User-triggered and billed; an agent cannot
launch it.

---

## Phase map

Each phase is independently shippable. Phases 0–2 are specified in full below; later phases are
mapped at phase level and will be detailed just-in-time, because decisions made during earlier
phases will change their shape and over-specifying them now guarantees rework.

| Phase | Delivers | Depends on |
|---|---|---|
| **0** | Foundation: Node 24/Wrangler 4, migration tracking, backups, local test environment, rollback tag | — |
| **1** | Shared `app.js` + navigation fixes across every page | 0 |
| **2** | Class capacity, next-class headcount panel, attendance pre-fill from RSVP, roster search | 0, 1 |
| **3** | Waitlist + coach notification hook (email + optional webhook) | 2 |
| **4** | Membership plans, payment recording, overdue flag on the attendance roster | 0, 1 |
| **5** | Attendance intelligence: over-limit flags, dormant-student alerts, basic reporting | 2, 4 |
| **6** | Progress notes, skill/competency grid, discipline tags | 1 |
| **7** | Account safety: self-service password reset, login rate limiting, audit trail | 0 |
| **8** | Public trial bookings for non-members | 2, 3, 7 |
| **9** | Indemnity waiver, emergency contact, POPIA review | 4, 6 |

**Your stated priority — a live headcount for the next class — lands at the end of Phase 2.**

---

# Phase 0 — Foundation

**Goal**: make the system safely and repeatably modifiable by an agent. Nothing here is
user-visible. Everything downstream depends on it.

**Why it comes first**: today, the only way to verify a change is to test against the production
database with disposable accounts. That is a bottleneck (every exit condition routes through a
human) and a hazard (test data touching real records). It also cannot test whole categories of
bug — the Phase 3 waitlist race condition, for instance, is untestable in production.

---

### T0.1 — Tag the current state as a rollback point

**Depends on**: nothing.
**Runs as**: `[HUMAN GATE]` (pushes to remote).

Create an annotated git tag on the current `main` HEAD marking the last known-good state before
any of this work begins, and push it to the remote.

Suggested name: `stable-phase3`.

**Exit condition**:
- `git tag -l` lists the tag locally.
- `git ls-remote --tags origin` lists the tag on the remote.
- `git show stable-phase3 --stat` reports the same commit as `git rev-parse HEAD` did before
  the tag was created.
- `git status` is clean.

**Why this first**: everything after this is recoverable with `git checkout stable-phase3`.
Cloudflare Pages' deployment history is the second, faster rollback (promote a previous
deployment from the dashboard) — but that recovers the *site*, not the *source*.

---

### T0.2 — Drop the `wrangler@3` pin

**Depends on**: T0.1.
**Runs as**: Sonnet, except the verification command marked below.

Node is now v24.19.0 and Wrangler 4.118.0 runs (`engines: node >=22.0.0`), so the pin is
obsolete. Remove every `wrangler@3` reference in favour of unpinned `wrangler`:

- `public/docs/coach-student-system.md` — the "Common maintenance tasks" commands and the
  "Why wrangler@3" section (delete the section, note the Node 24 requirement instead).
- `TODO.md` item 3 and the corresponding `HANDOVER.md` bullet.
- Any other occurrence — grep for `wrangler@3` across the repo and the outer folder.

Also investigate the npm version mismatch: `npm -v` reports 9.8.1, but Node 24 bundles npm 11.
Something on PATH is shadowing it. Diagnose and report; do not force-install a global npm
without confirming what's on PATH first.

**Exit condition**:
- `npx wrangler --version` outputs `4.x.x`.
- Grep for `wrangler@3` across the repo and outer folder returns zero hits.
- `[HUMAN GATE]` A read-only production query succeeds on the unpinned Wrangler:
  `npx wrangler d1 execute cjn-academy --remote --command="SELECT COUNT(*) FROM users;"`
- `npm -v` mismatch is either resolved or documented in `TODO.md` with the diagnosis.

---

### T0.3 — Production backup, and a repeatable backup procedure

**Depends on**: T0.2.
**Runs as**: `[HUMAN GATE]` (reads production).

Export the full production D1 database to a timestamped `.sql` file stored **outside the repo**
(the outer project folder, or wherever Giovanni prefers — it contains real user data and must
never be committed).

Then document the procedure in `public/docs/coach-student-system.md` under "Common maintenance
tasks", establishing the standing rule: **export before every migration.**

**Exit condition**:
- A `.sql` export file exists outside the repo, is non-empty, and contains `CREATE TABLE`
  statements for all six known tables: `users`, `sessions`, `class_templates`,
  `class_sessions`, `attendance`, `session_rsvps`.
- The file's row counts for `users` match the count returned by T0.2's verification query.
- The backup command is documented in `coach-student-system.md`.
- The export file is confirmed **not** tracked by git (`git status` clean, file is outside
  `public/` or gitignored).

**Note**: This backup is also the reference point for T0.4 — it proves what the schema looked
like *before* migration tracking was adopted.

---

### T0.4 — Adopt migration tracking, and reconcile production

**Depends on**: T0.3. **Do not attempt this without the backup in hand.**
**Runs as**: `[HUMAN GATE]` (writes to production).

Production currently has `0001_initial.sql` and `0002_session_rsvps.sql` applied, but **no
record inside the database** of that fact. Wrangler's migration system maintains a
`d1_migrations` table; pointed at production as-is, it would see an empty tracking table,
conclude nothing has been applied, and attempt to re-run `0001` against a database that already
has those tables.

Two sub-steps, in this order:

**T0.4a — Configure.** Add the `migrations_dir` setting to `wrangler.jsonc` pointing at
`migrations/`. Confirm the existing filenames (`0001_initial.sql`, `0002_session_rsvps.sql`)
satisfy Wrangler's expected `<number>_<name>.sql` convention.

**T0.4b — Reconcile production.** Insert rows into production's `d1_migrations` table recording
both existing migrations as already applied, **without re-running their SQL**. Determine
Wrangler 4's exact expected table shape first (create it locally via T0.5 and inspect, or check
`wrangler d1 migrations` docs) — do not guess the column names.

**Exit condition**:
- `npx wrangler d1 migrations list cjn-academy --remote` reports **zero pending migrations**.
- Production's table list is **byte-identical** to the T0.3 backup's table list — no table was
  created, dropped, or altered by this task.
- `SELECT COUNT(*) FROM users` returns the same number as in T0.2.
- The reconciliation procedure is documented in `coach-student-system.md`, including a warning
  that it is a one-time step.

**Rollback**: restore from the T0.3 export.

---

### T0.5 — Local development environment with a real local D1

**Depends on**: T0.4.
**Runs as**: Sonnet (entirely local, no production access).

Stand up `wrangler pages dev` serving `public/` with a **local** D1 database bound as `DB`, so
Functions, middleware, and the database all run locally. This is the environment every
subsequent phase is verified in.

Requirements:
- Local D1 created and all migrations applied via `wrangler d1 migrations apply` (local, not
  `--remote`) — proving the T0.4a configuration works.
- A **seed script** creating known test data: at least one coach, several students in varying
  states (active, inactive, pending, `must_change_password`), a few class templates across
  different weekdays, and some historical sessions with attendance. Seed data must be
  deterministic and re-runnable from scratch.
- An `npm run` script for each of: start the dev server, reset+seed the local DB.
- Documented in `coach-student-system.md`, replacing the current "local preview" note about
  `Server.js` not serving Functions or D1.

**Exit condition**, all demonstrated against `localhost`, not production:
- The dev server starts and serves the homepage.
- Logging in as the seeded coach with a known password sets a session cookie and lands on
  `/coach/dashboard.html`.
- Requesting `/coach/dashboard.html` with **no** cookie redirects to `/login.html` — proving
  middleware is active locally, which `Server.js` never did.
- An authenticated `GET /api/coach/students` returns the seeded roster as JSON.
- `GET /api/student/upcoming` as a seeded student returns the expected class list.
- Reset+seed can be run twice in a row and produces identical results.

**This is the highest-value task in Phase 0.** Every later exit condition depends on being able
to demonstrate behaviour without touching production.

---

### T0.6 — Automated test harness

**Depends on**: T0.5.
**Runs as**: Sonnet.

A runnable test suite exercising the API against the local environment. Use Node 24's built-in
test runner (`node --test`) — no new dependencies in the deployed site, and nothing to bundle.

Minimum coverage at this stage:
- **Date helpers** (`_utils/dates.js`) — including the timezone bug in T0.6b below.
- **Password hashing** — hash/verify round-trip, rejection of malformed hash strings.
- **Login flow** — success, wrong password, nonexistent user, inactive account, and that all
  failure modes return byte-identical responses (the user-enumeration guarantee).
- **Lockout** — 5 failures locks; a correct password during the lock window is still rejected.
- **Route protection** — each of the four middlewares, for unauthenticated, wrong-role, and
  `must_change_password` cases.
- **RSVP** — create, delete, and rejection of a past date.

**T0.6b — Fix the two bugs found during planning**, each with a regression test written *first*
and shown failing before the fix:

1. **Timezone.** `todayIso()` in `public/functions/api/_utils/dates.js` returns the **UTC**
   date. The gym is in Somerset West (SAST, UTC+2, no DST). Between 00:00 and 02:00 local time
   it returns *yesterday*, so `/api/student/upcoming` offers a 7-day window starting yesterday
   and `rsvp.js`'s `date < todayIso()` guard accepts an RSVP for a class that already finished.
   Fix by computing the current date in a fixed `Africa/Johannesburg` offset. Do not use the
   Worker's local timezone — it is UTC and will stay UTC.
2. **RSVP day-of-week validation.** `public/functions/api/student/rsvp.js` verifies the template
   exists and the date isn't past, but never checks the date's day-of-week matches the
   template's `day_of_week`, nor that it falls within the 7-day window the UI offers. A crafted
   request can write an RSVP for a Tuesday class on a Thursday, or in 2031. Students can only
   write their own rows so this is a data-integrity issue, not a security hole — but the coach's
   RSVP column is what surfaces the bad data, and Phase 2 builds headcounts on top of it.

   **This validation applies to RSVP *creation* only (`going === true`).** Cancellation must
   require one thing and one thing only: the row belongs to the requesting user. Deleting your
   own RSVP is always safe, and gating it on the creation rules makes rows permanently
   undeletable whenever the date later falls outside the window or a coach edits the template's
   `day_of_week` after RSVPs already exist against it — inflating the very headcount Phase 2
   depends on. *(Spec defect found by review at the Phase 0 checkpoint; the original wording
   omitted this and the bug was implemented exactly as written.)*

   Derive the window from a **single shared constant/helper** used by both this file and
   `student/upcoming.js`. If the two disagree, the UI offers RSVPs the API rejects, or vice
   versa.

**Exit condition**:
- `npm test` runs the suite against a freshly seeded local DB and passes.
- Both regression tests in T0.6b were demonstrated **failing** before their fix and passing
  after. Report the before/after output.
- Deliberately breaking any one assertion causes a visible test failure — proving the suite
  actually asserts rather than merely executing.
- Test procedure documented in `coach-student-system.md`.

---

### T0.7 — Branch convention and documentation

**Depends on**: T0.6.
**Runs as**: Sonnet, with `[HUMAN GATE]` on the push.

Phases 1–3 pushed each stage directly to `main`. From here, each phase gets a feature branch,
merged after review.

- Document the convention in `HANDOVER.md`, superseding the "Branch convention" section.
- Update `public/docs/coach-student-system.md` for everything Phase 0 changed: Node 24, no
  Wrangler pin, migration tracking, backups, local environment, test suite.
- Update `TODO.md`: remove the resolved Wrangler-pin item, record what Phase 0 delivered.

**Exit condition**:
- All three docs reflect the post-Phase-0 reality; no stale `wrangler@3` or "no test suite"
  claims remain.
- Phase 0's work is committed on a branch, **pushed to the remote** (a local-only branch means
  the phase exists on one disk), and merged to `main` after confirmation.
- `stable-phase3` still resolves to the pre-Phase-0 commit.
- **Post-deploy Functions smoke test.** Phase 0 adds `functions/package.json` to the deployed
  tree for local-testing reasons. The claim that Wrangler's bundler ignores it is plausible but
  was *asserted, not verified*. After the merge deploys, confirm against the **live** site that
  Functions still work: a real login succeeds, one authenticated API call returns JSON, and an
  unauthenticated `/coach/dashboard.html` still redirects. Any change to files under
  `functions/` must clear this check before the phase is called done.
  *(Gap found at the Phase 0 checkpoint — the original T0.7 had no live-Functions verification
  despite Phase 0 touching the Functions tree.)*

---

### T0.8 — Stop serving internal docs publicly

**Depends on**: nothing (may run in parallel with T0.1–T0.7).
**Runs as**: Sonnet.

`public/docs/coach-student-system.md` sits inside the deployed directory, so it is live at
`cjnacademy.com/docs/coach-student-system.md`. It documents the full auth model, every endpoint,
the lockout threshold and window, and the password hash format. No secrets, so this is not
urgent — but it is free reconnaissance, and it becomes materially worse once it documents
payment records and waiver data.

**Decided approach** (2026-08-05): gate `/docs/*` behind a coach session using the middleware
pattern already proven in this codebase. Add `public/functions/docs/_middleware.js` following
`public/functions/coach/_middleware.js` — unauthenticated requests redirect to `/login.html`,
non-coach sessions redirect to their own dashboard. This keeps the document version-controlled
(its history is where the system's *design rationale* lives) while removing it from public view.

**Do not use `_routes.json`** — it controls which paths invoke Functions, not which static
assets are served, so it cannot block this. Do not move `docs/` out of the repo; that was
considered and rejected, since it would put the living reference in the same untracked,
single-machine bucket `TODO.md` already warns about for `package.json`.

**Exit condition**:
- Requesting `/docs/coach-student-system.md` with no session cookie redirects to `/login.html`
  — verified locally first, then against the deployed site.
- Requesting it as a logged-in **coach** serves the document.
- Requesting it as a logged-in **student** redirects to `/student/dashboard.html`.
- The document is still present in the repo and still tracked by git.
- The access method is noted in `HANDOVER.md`.

---

# Phase 1 — Shared frontend and navigation

**Goal**: eliminate the per-page duplication before it multiplies, and fix the navigation dead
ends. These are one task set, not two, because both mean rewriting the header block on every
authenticated page — doing them separately means touching all eight files twice.

**Why now**: the refactor is cheap at 8 pages and expensive at the ~14 pages Phases 2–6 will
produce. Doing it after the foundation but before the features is the only time it's cheap.

**Risk note**: this touches every page of a working site. It happens on a branch, with
`stable-phase3` as the fallback, and every page is verified individually.

**What Phase 0 changed for this phase** (reviewed at the Phase 0 → 1 checkpoint, 2026-08-05).
The phase's shape is unchanged — still T1.1–T1.3, still the right next phase, still the cheap
moment to do it. Three things carry over:

1. **There is now a local environment to verify against** (`npm run dev`), so no part of Phase 1
   needs a production test account. Nothing here touches D1, so there is no migration, no backup
   gate, and no `--remote` command in the entire phase.
2. **The test suite cannot see any of this phase's exit conditions.** It is HTTP-only: no DOM, no
   console, no click. Every T1.1/T1.2 exit condition is browser-observable. T1.1 now specifies
   the verification method rather than leaving it implied — this is the direct application of
   Phase 0's recurring lesson, that a claim nothing mechanically checks is a claim that survives
   review while being false.
3. **The repo root moved** (`f0c3ec8`), so `app.js` at `public/app.js` is tracked normally and
   git commands run from the outer folder. The docs have not all caught up — see T1.3.

---

### T1.1 — Extract shared frontend code into `app.js`

**Depends on**: T0.7 (needs the local environment and test suite).
**Runs as**: Sonnet.

**Verified inventory** (checked against the code at the Phase 1 checkpoint, 2026-08-05 — do not
re-derive, but do report if any of it has drifted):

| Duplicated block | Lines each | Pages |
|---|---|---|
| Nav/hamburger (toggle, close-on-link, close-on-scroll, body lock) | ~21 | 8 authenticated + `index.html` (in `script.js`) |
| Logout click handler | 5 | 8 authenticated |
| `escapeHtml` | 5 | 7 (all authenticated except `coach/dashboard.html`) |
| `#year` footer stamp | 1 | all 12 |

That is ~255 duplicated lines, not the ~30 an earlier draft of this task claimed. All 12 pages
currently carry a single inline `<script>` at the end of `<body>`; there is no external JS
anywhere except `index.html`'s `script.js`.

`login.html`, `change-password.html`, and `request-account.html` have a **logo-only header** —
no `.menu-toggle`, no `.nav-links`, no logout link. This is why every DOM lookup in `app.js`
must be guarded: those three pages will load it and find almost nothing.

Create `public/app.js` containing the shared behaviour. Extract at minimum: nav/hamburger
behaviour, logout handling, `escapeHtml`, the `#year` stamp, and a small `fetch` JSON wrapper
(every page repeats the same `fetch` → `.json()` → `if (data.ok)` shape).

#### The `script.js` collision — read this before writing anything

`public/script.js:2-30` **already implements the identical hamburger logic** for `index.html`,
and `script.js:33` already does the `#year` stamp. Load `app.js` alongside it unchanged and both
bind a click listener to the same `.menu-toggle`; both call `classList.toggle('open')`; the
class toggles twice per click and **the menu never opens**. An earlier draft of this task said
"do not change `script.js`" while also requiring `app.js` on `index.html` and a working
hamburger on every page — those three requirements cannot all hold.

**Resolution (decided by Giovanni, 2026-08-05)**: delete `script.js:1-33` — the nav block and
the `#year` line — and let `app.js` own them on `index.html` too. Everything below stays exactly
as it is:

- the contact-form submit handler (`script.js:51-78`) — untouched, and `functions/api/contact.js`
  is not part of this task either;
- the hide-header-on-scroll effect (`script.js:80-97`) — **stays in `script.js`, homepage-only**.
  It is deliberately not extracted: spreading it to 8 authenticated pages is a visible UX change
  and does not belong inside a refactor commit. Record the divergence in the completion report.

The history was checked for a reason the homepage needed its own menu implementation: there
isn't one. `066ff64` states the coach/student pages *replicated the homepage's* pattern inline
purely because no shared module existed, and the only documented blocker — `script.js`
referencing `#contactForm` — is about loading `script.js` elsewhere, not the reverse.

#### Load pattern — identical on all 12 pages, no variation

- `<script defer src="/app.js?v=1"></script>` in `<head>`. **Absolute path**, because pages sit
  at two directory depths (`/index.html` and `/coach/session.html`); a relative `app.js` breaks
  in one of them. **Versioned**, per this document's rule 5 — a new asset with a 4-hour
  Cloudflare cache and no version string is unfixable for four hours after a bad deploy.
- `defer` guarantees it executes after the DOM is parsed and **before** each page's existing
  inline block at the end of `<body>`, so helpers like `escapeHtml` are defined by the time that
  block runs. Do not use `async`; do not drop `defer` and leave it in `<head>`.
- `index.html` keeps `<script src="script.js"></script>` where it is, after `app.js`.

#### Verification method (this phase has no mechanical check without one)

Phase 0's suite is HTTP-only — it cannot see a console error or a stuck menu, and every exit
condition below is DOM-observable. Phase 0's own lesson was that a confident claim survived two
review passes because nothing mechanically checked it. So do both:

1. **Browser-driven, per page.** With `npm run dev` running, load each of the 12 pages in the
   browser tool and capture console output. Paste the actual per-page result into the completion
   report — 12 lines of evidence, not one sentence claiming they were all fine.
2. **A grep-shaped regression test**, added to the suite: for each of the 12 pages, assert the
   served HTML references `/app.js?v=` and no longer contains `menuBtn.addEventListener` or
   `function escapeHtml`. The realistic failure mode across 12 near-identical files is *missing
   one*, and that is exactly what a human page-by-page sweep is worst at catching.

**Exit condition**:
- All 12 pages load with **zero console errors**, evidenced per page.
- The hamburger opens, closes on link click, closes on scroll, and locks body scroll — on all 9
  pages that have one, **`index.html` included** (this is the one the collision above breaks;
  test it deliberately, don't assume).
- Logout works from every page that offers it and lands on `/login.html`.
- The contact form on `index.html` still submits, and the header still hides on scroll-down
  there — proving the surviving half of `script.js` is intact.
- The new grep-shaped test passes, and fails if `app.js` is removed from any one page.
- Net line count across the touched files is **lower** than before. If it isn't, the extraction
  didn't achieve anything — report rather than proceeding.
- `styles.css?v=` bumped on every page if any CSS changed; unchanged if none did.

---

### T1.2 — Fix the navigation dead ends

**Depends on**: T1.1.
**Runs as**: Sonnet.

Three specific gaps identified by Giovanni:

1. **No way home.** Logged-in pages offer no route back to the public homepage. The `.logo`
   element links to `/`, but there is no explicit nav item and the behaviour isn't obvious.
2. **No way back into the app.** A logged-in user who reaches the homepage sees a "Login" link
   even though they're already authenticated, with no route back to their dashboard.
3. **No way back from a session.** `/coach/session.html?id=...` is reached from
   `/coach/attendance.html` and has no back link — the only exit is the browser button.

For (2), note the architectural constraint: `index.html` is a **static public page with no
middleware**, so it cannot know server-side whether the visitor is logged in. Resolve with a
lightweight client-side check — a small public endpoint returning session state (name + role,
nothing sensitive) that the homepage calls to swap "Login" for "My dashboard".

**Endpoint spec.** Put it at `public/functions/api/auth/session.js`. Verified: `functions/api/`
has middleware only under `api/coach/` and `api/student/`, so anything under `api/auth/` is
public by construction — no exclusion needed, and nothing to add to a middleware.

- Reuse `getSessionUser(context)` from `_utils/auth.js`. It returns `null` or
  `{sessionId, user:{id, email, name, role, mustChangePassword}}`.
- **Whitelist the two fields explicitly** — `{ok:true, user:{name, role}}`. Do not spread or
  return `session.user`, which carries `id`, `email`, and `mustChangePassword`. A spread here is
  the entire leak, and it is one character away from correct.
- Anonymous → `200 {ok:true, user:null}`. **Not** a 401, not a redirect. A 401 in the console on
  every homepage visit makes the public site look broken to anyone who opens devtools, and it
  trains the next person to ignore console noise.

For (3), `/coach/session.html`'s back link needs a target that preserves the date, and
**`/coach/attendance.html` cannot currently accept one**: `attendance.html` sets
`dateInput.value = todayLocalIso()` unconditionally on load and never reads the URL. So this is
two changes, not one:

- `attendance.html` reads `?date=YYYY-MM-DD`, validates it (reject a malformed value rather than
  feeding garbage to the date input), and falls back to today when absent or invalid.
- `session.html` builds the link as `/coach/attendance.html?date=${data.session.date}` once its
  fetch resolves. The session's date is already in the API response — no new endpoint. Render a
  plain `/coach/attendance.html` link immediately so there is never a window where the page has
  no way back; upgrade the `href` when the date arrives.

Audit every page for the same class of dead end while in here, and fix any others found.

**Exit condition**:
- From every authenticated page, a visible link reaches the public homepage in one click.
- Visiting `/` while logged in as a coach shows a link to `/coach/dashboard.html`; as a student,
  `/student/dashboard.html`; logged out, the existing "Login" link, unchanged.
- The session-state endpoint returns a negative answer for anonymous visitors **without** a 401,
  redirect, or console error — the homepage must not appear broken to the public.
- The endpoint leaks nothing beyond name and role. Explicitly: no email, no id, no
  `mustChangePassword`. **Assert the exact key set** in a test (`Object.keys(body.user)`), not
  just that the expected fields are present — a test that only checks `name` and `role` are
  there passes just as happily when `email` is there too.
- Integration tests cover all three cases: anonymous, coach, student. This is a new public
  endpoint; Phase 0's route-protection suite is the place it belongs.
- `/coach/session.html` has a back link returning to `/coach/attendance.html` with the same date
  still selected — demonstrated by opening a session for a **non-today** date and confirming the
  date input comes back on that date, not today.
- `attendance.html?date=` with a malformed value (`?date=banana`, `?date=2026-02-30`) falls back
  to today without a console error.
- Verified on mobile viewport as well as desktop, using T1.1's browser-driven method.

---

### T1.3 — Phase 1 documentation and merge

**Depends on**: T1.2.
**Runs as**: Sonnet, `[HUMAN GATE]` on merge/push.

Update `coach-student-system.md`'s "Frontend notes" section — the claim that every page has its
own inline script and that no shared module exists becomes false with T1.1. Specifically
`coach-student-system.md:411-415` (no shared module, `script.js` unusable elsewhere) and
`:427-430` ("each page has its own copy of that JS"). Add `/api/auth/session` to the API
reference table, and `app.js` to "Shared code".

**Stale claims found at the Phase 1 checkpoint** — all pre-existing, none caused by Phase 1, all
in `coach-student-system.md`, all verified against the code on 2026-08-05. Fix them in this same
pass rather than leaving a doc that is wrong about the repo it documents:

- `:150` — "Git repo root is `public/`". False since `f0c3ec8`; it is the outer folder.
- `:229` — describes `test/` as "untracked, same convention as `scripts/`". Both are tracked now,
  for the same reason (`f0c3ec8`).
- `:313-314` — "All `wrangler d1`/`wrangler pages` commands in this project use plain
  `npx wrangler`". The documented maintenance commands do; the local tooling deliberately does
  not, and the paragraph at `:196-216` explains at length why. Scope the claim to the former.
- `:366` — "Four middleware files". There are five: `docs/_middleware.js` was added by T0.8, and
  this same document already says five at `:244`.
- `:3` — the status line still reads "Phase 1, Phase 2 and Phase 3 complete (2026-08-04)" with no
  mention of Phase 0.

**Also log to `TODO.md`, do not fix here** (Bucket 2 — real, out of scope, and it belongs to the
phase that actually depends on it): `coach/attendance.html`'s `todayLocalIso()` computes "today"
from the **browser's** timezone, a third notion of today alongside the server's SAST `todayIso()`
fixed in T0.6b. They agree for a coach physically in South Africa and disagree for a traveller or
anyone on a VPN. Phase 2's next-class panel (T2.3) builds directly on this ground and is where it
should be resolved.

**Exit condition**:
- Docs accurate — no remaining stale claim from the list above, verified by re-reading each named
  line, not by grepping for a fix summary.
- `/code-review ultra` run on the branch before merge, and its findings triaged per this
  document's four-bucket rule with each finding re-checked at the `file:line` it names.
- `reports/phase-1-completion.md` written with per-task evidence, including the 12-page console
  capture from T1.1.
- Branch merged after confirmation.
- **Post-deploy verification against the live site**, not a preview: homepage, login, coach
  dashboard, student dashboard all load with no console error, the homepage swaps "Login" for
  "My dashboard" when logged in, and the contact form still submits. `app.js` is a new asset on
  every page at once — if it 404s or is cached wrong, every page breaks simultaneously, which is
  a larger blast radius than anything Phase 0 deployed.

---

# Phase 2 — Capacity, headcount, and coach quality-of-life

**Goal**: Giovanni's stated #1 — a live count of who's coming to the next class — plus the
admin-time reductions that share the same code.

---

### T2.1 — Add capacity to the schema

**Depends on**: T1.3.
**Runs as**: Sonnet locally; `[HUMAN GATE]` for the production migration.

Migration `0003_class_capacity.sql`:
- `class_templates.capacity` — INTEGER, nullable. NULL means "no limit".
- `class_sessions.capacity` — INTEGER, nullable. NULL means "inherit from the template".

Nullable in both cases so existing rows remain valid and unlimited-capacity stays expressible.

**Exit condition**:
- Migration applies cleanly to a **freshly seeded local DB** and to a local DB restored from the
  T0.3 production export (proving it works against real data shapes, not just seed data).
- `wrangler d1 migrations list` shows it pending before, applied after.
- Existing tests still pass.
- Production application is a separate, human-gated step, preceded by a fresh backup per T0.3.

---

### T2.2 — Capacity management UI

**Depends on**: T2.1.
**Runs as**: Sonnet.

- `/coach/templates.html` — capacity field when creating/editing a weekly class. Blank =
  unlimited.
- `/coach/attendance.html` — optional capacity override when creating a session. Blank =
  inherit from template.
- Corresponding API changes to the templates and sessions endpoints.

**Exit condition**:
- A capacity set on a template persists, displays on reload, and can be cleared back to
  unlimited.
- A session created from a template with capacity 20 and no override reports capacity 20.
- A session created with an override of 12 reports 12, and the template still reports 20.
- Non-numeric, negative, and zero capacities are rejected with a clear error — **server-side**,
  not just by the HTML input type.
- Tests cover inheritance and override resolution.

---

### T2.3 — Next-class panel on the coach dashboard

**Depends on**: T2.2. **This is the stated headline goal.**
**Runs as**: Sonnet.

`/coach/dashboard.html` gains a panel showing the next upcoming class: name, date, start time,
confirmed RSVP count, capacity, and spots remaining.

"Next" means the earliest future occurrence from the active weekly templates, using the
timezone-correct `todayIso()` fixed in T0.6b. A class that started earlier today is not "next".

**Exit condition**:
- With seeded data, the panel names the correct next class — verified across at least three
  scenarios: mid-week, a class later today, and the last class of the week rolling to next week.
- The RSVP count matches a direct `SELECT COUNT(*)` against `session_rsvps` for that
  template+date.
- Unlimited-capacity classes display sensibly (e.g. "12 going") rather than "12 / null".
- No class scheduled in the next 7 days renders a clear empty state, not a blank panel or an
  error.
- **Timezone check**: with the clock simulated at 00:30 SAST, the panel does not show a class
  that already finished yesterday. This is the T0.6b regression, verified at the feature level.

---

### T2.4 — Pre-fill attendance from RSVPs

**Depends on**: T2.3.
**Runs as**: Sonnet.

`/coach/session.html` currently defaults every student to *absent*. Change the default so
students who RSVP'd for that class+date are pre-selected **present**, turning roster marking
from twenty clicks into correcting two exceptions.

Constraints, all load-bearing:
- Pre-fill applies **only** to a session that has never been saved. Reopening a saved session
  must show exactly what was last saved — the existing amend-after-the-fact guarantee must not
  regress.
- One-off sessions (`template_id IS NULL`) have no RSVPs; they keep defaulting to absent.
- Pre-fill is a UI default only. It must not write attendance rows until the coach saves.

**Exit condition**:
- A never-saved session created from a template shows RSVP'd students as present and everyone
  else as absent.
- Saving, then changing a student to absent, then saving, then reopening shows that student
  **absent** — the saved state wins over the RSVP pre-fill. This is the regression that matters
  most; test it explicitly.
- Opening and *not* saving writes zero attendance rows (verify by direct query).
- A one-off session defaults everyone to absent.
- Tests cover all four cases.

---

### T2.5 — Roster search and filter

**Depends on**: T2.4.
**Runs as**: Sonnet.

Client-side search on `/coach/students.html` filtering by name and email as you type, plus a
status filter (active / inactive / all). Client-side is sufficient and correct at gym scale —
the roster is already fully loaded — and avoids a new endpoint. Revisit only past ~500 students.

**Exit condition**:
- Typing filters the visible rows to matching name or email, case-insensitively.
- Clearing the box restores every row.
- The status filter composes with the search rather than replacing it.
- No matches renders a clear empty state.
- Works on mobile viewport inside the existing `.scroll-x` wrapper.

---

### T2.6 — Phase 2 production rollout and documentation

**Depends on**: T2.5.
**Runs as**: `[HUMAN GATE]` throughout.

1. Fresh production backup (T0.3 procedure).
2. Apply migration `0003` to production via `wrangler d1 migrations apply --remote`.
3. Merge the branch, deploy, verify live.
4. Update `coach-student-system.md` — schema, endpoints, coach walkthrough.

**Exit condition**:
- `wrangler d1 migrations list --remote` shows zero pending.
- The live coach dashboard shows a correct next-class panel with real data.
- Setting a real capacity on a real weekly class persists and displays.
- Existing real attendance records are unaffected — spot-check a historical session against the
  pre-migration backup.

---

# Phases 3–9 — mapped, to be detailed just-in-time

Specified at phase level deliberately. Each will be expanded into full task detail at the point
it starts, informed by what the preceding phases actually turned up.

### Phase 3 — Waitlist and coach notifications
`session_rsvps` gains a `status` column (`going` / `waitlisted`); `created_at` provides FIFO
ordering. At capacity, RSVPs become waitlist entries; on cancellation the oldest waitlisted
student is auto-promoted. **The last-spot race condition must be handled explicitly** — two
simultaneous RSVPs both reading "19 of 20" would both insert. Approach: insert, re-count, demote
anyone past capacity by `created_at`. This is untestable in production and is the concrete
justification for T0.5.

Notifications via a single internal `notifyCoach()` module emitting two events —
`waitlist_joined` (emails the coach) and `waitlist_promoted` (emails the **student**, plus the
coach; non-optional, since a waitlist that promotes silently is worse than no waitlist).

**Both delivery paths are in scope** (confirmed 2026-08-05), and both are built in Phase 3:
1. **Email**, always fires. Stable bracketed subject topic (`[CJN][WAITLIST_JOINED] ...`) and a
   key-value body, so an inbox-watching automation can filter and parse it.
2. **Webhook**, POSTs the same event as structured JSON with a shared-secret header. Target URL
   in `COACH_WEBHOOK_URL`; if unset, this half silently no-ops so the feature ships working
   either way.

Recipient address in `COACH_NOTIFY_EMAIL`, never hardcoded. Note for whoever builds this:
Cloudflare env vars are readable only by the Functions themselves — nothing external can read
them. They configure *where the site sends*, they are not a channel anything subscribes to.

Giovanni's own WhatsApp automation is downstream and out of scope — the site's contract ends at
"emits a well-formed event".

### Phase 4 — Memberships and payment recording
Record-only: no gateway, no card data, no PCI scope. Coach-defined plans (name, price, allowance
count, period). A payments ledger recording money already collected out-of-band, with
`recorded_by` for audit. Overdue status surfaced on the attendance roster, where it's actually
actionable. Schema designed so a gateway *could* attach later without a rewrite.

### Phase 5 — Attendance intelligence
Over-limit flags (counting attendance marked `present` against the plan's allowance, per
calendar week/month, coach-visible only, never blocking). Dormant-student alerts — the churn
signal, same query engine, opposite direction. Basic reporting: headcount, attendance trends,
revenue recorded.

### Phase 6 — Progress notes and competency
Coach-defined skill taxonomy with a level per student, plus **one running free-text note per
student, overwritten in place** — no dated history, per Giovanni's preference. Store
`updated_at`/`updated_by`, and keep a hidden append-only copy purely as an undo safety net
against accidental overwrite; the UI stays a single field. Discipline tags (boxer / kickboxer /
Muay Thai) are **multi-valued** — a junction table, not a delimited column — and purely
informational, restricting nothing. Coach-only visibility; students do not see their own notes.

### Phase 7 — Account safety
Self-service password reset (currently manual SQL — this will bite the moment trial users
onboard, and it will bite on a class night). IP-based rate limiting on `/api/auth/login` and,
critically, on the Phase 8 public endpoints. Audit trail for membership and payment changes.
**Sequenced before Phase 8 because Phase 8 opens the first unauthenticated write endpoint and
must not ship without rate limiting.**

### Phase 8 — Public trial bookings
Non-members book a trial class from the public site, consuming the same capacity as member
RSVPs so the headcount stays honest. This is the **first unauthenticated endpoint that writes
real rows** — the contact form only sends email. That is a genuine change to the threat model:
needs rate limiting (Phase 7), abuse protection, a per-person trial limit, and a decision on
whether a booking creates a `pending` user or a separate `trial_bookings` record.

### Phase 9 — Waiver, emergency contact, POPIA
Indemnity waiver and emergency contact capture — a real gap for a combat sports gym, arguably
more pressing than several features ahead of it in this list; sequenced late only because it
needs the membership model underneath it. **Note**: a minor's waiver requires a guardian, which
reintroduces the parent-account question deferred during planning. POPIA review of what is
stored and why, now that the system holds health-adjacent progress notes and payment records on
real individuals. Some of this needs Giovanni's real-world input (waiver wording) and is not
purely an engineering task.

---

## Open questions carried forward

Not blocking Phases 0–2; must be answered before the phase named.

1. **Phase 3** — should the coach be notified when a class merely *reaches* capacity, or only
   when someone actually joins the waitlist? Current assumption: waitlist join only, since
   that's the actionable signal.
2. **Phase 4** — what happens to an overdue member's RSVP? Current assumption: nothing, flag
   only, consistent with the over-limit decision.
3. **Phase 6** — who defines the skill taxonomy, and is it editable in the UI or seeded in a
   migration? Current assumption: coach-editable in the UI.
4. **Phase 8** — does a trial booking create a `pending` user (reusing the Phase 2 approval
   flow) or a separate record? Leaning `pending` user, for reuse.
5. **Phase 9** — waiver wording is a legal question, not an engineering one. Needs a real
   answer before the phase can be built.

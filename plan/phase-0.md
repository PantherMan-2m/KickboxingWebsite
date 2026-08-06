# Phase 0 — Foundation

**Status**: Done, merged to `main` (`9582248`). See `reports/phase-0-completion.md` for
full evidence. This file is kept for historical reference — a session working on a later
phase should not need to read it; see `PLAN.md`'s "Keeping sessions cheap" section.

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

- `public/docs/coach-student-system-technical.md` — the "Common maintenance tasks" commands and
  the "Why wrangler@3" section (delete the section, note the Node 24 requirement instead).
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

Then document the procedure in the technical reference doc under "Common maintenance
tasks", establishing the standing rule: **export before every migration.**

**Exit condition**:
- A `.sql` export file exists outside the repo, is non-empty, and contains `CREATE TABLE`
  statements for all six known tables: `users`, `sessions`, `class_templates`,
  `class_sessions`, `attendance`, `session_rsvps`.
- The file's row counts for `users` match the count returned by T0.2's verification query.
- The backup command is documented.
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
- The reconciliation procedure is documented, including a warning that it is a one-time step.

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
- Documented, replacing the current "local preview" note about `Server.js` not serving
  Functions or D1.

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
- Test procedure documented.

---

### T0.7 — Branch convention and documentation

**Depends on**: T0.6.
**Runs as**: Sonnet, with `[HUMAN GATE]` on the push.

Phases 1–3 pushed each stage directly to `main`. From here, each phase gets a feature branch,
merged after review.

- Document the convention in `HANDOVER.md`, superseding the "Branch convention" section.
- Update the technical reference doc for everything Phase 0 changed: Node 24, no
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

The technical reference doc sits inside the deployed directory, so it was live at
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

# Phase 0 Completion Report — Foundation

**Status**: T0.1–T0.8 done and verified, survived three independent review checkpoints —
two holding the merge for fixes (4, then 5 — see "Round 3" below), one (the second-pass
`/code-review ultra` triage, `reports/phase-0-review-triage.md`) sorting the resulting 11
findings into fix-now/log/reject/decline. Branch pushed to `origin`. Remaining before the
phase is done: the merge itself (`[HUMAN GATE]`), and T0.7's post-deploy live-Functions
smoke test, which can only run after that merge deploys.

**Branch**: `phase-0-foundation`, pushed to `origin` with upstream tracking. **Correction**:
an earlier version of this report claimed T0.1–T0.4 "landed on `main` directly" — that was
wrong. `main` was never touched by any of Phase 0's work; it remains at `44edd13`, byte-
identical to `origin/main`, verified via `git rev-parse main` / `git rev-parse origin/main`
returning the same hash. What actually happened: T0.1–T0.4's file edits (T0.2's doc
updates, T0.3's backup, T0.4's `wrangler.jsonc` change) were made as uncommitted
working-tree changes while `main` was checked out, then carried over intact when
`git checkout -b phase-0-foundation` was run just before T0.5's work began (checkout
preserves uncommitted changes across the branch switch) — they were never committed to
`main` at any point, only later committed on `phase-0-foundation` itself, alongside
T0.5–T0.8, as part of the 7-commit (later 10-commit) batch. The only Phase 0 artifact that
ever touched anything outside this branch is T0.1's `stable-phase3` tag, which was created
and pushed to `origin` directly (tags aren't branch-scoped).

---

## T0.1 — Tag the current state as a rollback point

**Exit conditions, all demonstrated**:
- `git tag -l` lists `stable-phase3` locally.
- `git ls-remote --tags origin` lists it on the remote, peeled to commit `44edd13`.
- `git show stable-phase3 --stat` reports commit `44edd134784751a00d81410822486513bc44f35f`,
  matching `git rev-parse HEAD` taken immediately before the tag was created.
- `git status` clean before and after.

No discrepancies.

---

## T0.2 — Drop the `wrangler@3` pin

**Exit conditions, all demonstrated**:
- `npx wrangler --version` → `4.118.0`.
- Grep for `wrangler@3` across repo + outer folder → zero hits, except `PLAN.md` itself
  (which documents this task using that literal string — a historical record, not living
  documentation, deliberately left alone).
- `[HUMAN GATE]` read-only production query on unpinned Wrangler:
  `npx wrangler d1 execute cjn-academy --remote --command="SELECT COUNT(*) FROM users;"`
  → `{"COUNT(*)": 2}`. (This count of 2 real users is the baseline cross-checked against
  in T0.3 and T0.4 below.)
- `npm -v` mismatch diagnosed and resolved (see discrepancy below).

**Discrepancy**: `npm -v` reported `9.8.1` despite Node 24 bundling npm `11.17.0`. Root
cause: a stale global npm 9.8.1 install at
`C:\Users\User\AppData\Roaming\npm\node_modules\npm` (leftover from an old Node
installation, alongside unrelated old globals — `node-red`, `grunt`,
`electron-packager`) was shadowing the bundled npm, because npm's own launcher script
always prefers whatever npm is registered at `npm config get prefix`. Fixed with
`npm install -g npm@latest` (resolved to `12.0.2`), confirmed the other global shims were
untouched. Documented in `TODO.md`.

---

## T0.3 — Production backup, and a repeatable backup procedure

**Exit conditions, all demonstrated**:
- `backups/cjn-academy-2026-08-05.sql` (outer folder, sibling to `public/`) exists,
  8,214 bytes, contains `CREATE TABLE` for all six known tables: `users`, `sessions`,
  `class_templates`, `class_sessions`, `attendance`, `session_rsvps`.
- File contains exactly 2 `INSERT INTO "users"` rows, matching T0.2's `COUNT(*)` = 2.
- Backup command documented in `coach-student-system.md` under "Common maintenance
  tasks", with the standing "export before every migration" rule.
- Confirmed untracked: the file lives entirely outside the `public/` git root, so
  `git status` inside `public/` never references it.

No discrepancies.

---

## T0.4 — Adopt migration tracking, and reconcile production

**T0.4a (configure)**: `migrations_dir: "migrations"` added to the `DB` entry in
`wrangler.jsonc`. Verified `wrangler d1 migrations list cjn-academy --remote` resolves
both `0001_initial.sql` and `0002_session_rsvps.sql` correctly before and after the
config change (same result both times — config was already using Wrangler's default
`migrations` dir, this makes it explicit).

**T0.4b (reconcile production)**: determined the exact `d1_migrations` table shape by
applying migrations to a fresh local D1 first and inspecting it directly (via Node's
built-in `node:sqlite`):
```sql
CREATE TABLE "d1_migrations"(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)
```
Confirmed production already had this exact table (auto-provisioned by D1) with 0 rows.
`[HUMAN GATE]`, confirmed by Giovanni, then ran:
```sql
INSERT INTO d1_migrations (name, applied_at) VALUES
  ('0001_initial.sql', '2026-08-04 12:44:58'),
  ('0002_session_rsvps.sql', '2026-08-04 21:00:33');
```
(timestamps taken from each migration file's actual commit time, converted from SAST to
UTC, as a best-effort approximation of real apply time).

**Exit conditions, all demonstrated**:
- `wrangler d1 migrations list cjn-academy --remote` → "No migrations to apply!"
- Production's table list unchanged before/after (9 tables, no create/drop/alter):
  `_cf_KV, attendance, class_sessions, class_templates, d1_migrations, session_rsvps,
  sessions, sqlite_sequence, users`.
- `SELECT COUNT(*) FROM users` → still 2.
- Reconciliation procedure documented in `coach-student-system.md`, marked one-time.

No discrepancies beyond what PLAN.md already anticipated (it predicted the empty
auto-provisioned `d1_migrations` table scenario exactly).

---

## T0.5 — Local development environment with a real local D1

**Exit conditions, all demonstrated against `localhost`, not production**:
- `npm run dev` starts and serves the homepage (`GET /` → 200).
- Local D1 created, migrations applied via `wrangler d1 migrations apply --local` (not
  `--remote`).
- `npm run db:reset` seeds deterministic data: 2 coaches, 6 students across every status
  the app cares about (active ×2, inactive, pending, must-change-password, plus one
  reserved for the lockout test), 4 weekly templates across different weekdays
  (Mon/Wed/Fri active, Sat inactive), 2 historical sessions with mixed attendance. Run
  twice in a row: identical row counts both times (8 users, 4 templates, 2 sessions, 6
  attendance rows) — confirmed idempotent.
- Logging in as the seeded coach (`coach@seed.test` / `CoachPass123!`) sets a session
  cookie (`Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax`) and reaches
  `/coach/dashboard.html` (200, after Cloudflare Pages' standard clean-URL redirect from
  `.html` — confirmed this is platform behavior, not a bug).
- `GET /coach/dashboard.html` with no cookie → 302 to `/login.html`, proving middleware
  is active locally (which `Server.js` never provided).
- Authenticated `GET /api/coach/students` → the 6 seeded students as JSON.
- `GET /api/student/upcoming` as a seeded student → correct 7-day class list, correctly
  excluding the inactive Saturday template.

**Discrepancy — the highest-cost surprise in Phase 0 so far**: `wrangler pages dev` does
**not** auto-bind D1 from `wrangler.jsonc` the way `wrangler dev` (plain Workers) does —
confirmed by direct testing, contradicting what `README.md` previously assumed
("`wrangler.jsonc` at the repo root declares the D1 binding... for local dev"). Without
an explicit `--d1` flag, `env.DB` is `undefined` and every Functions handler touching the
database throws `TypeError: Cannot read properties of undefined (reading 'prepare')`.
Worse: `--d1=DB=cjn-academy` (binding `=` database **name**) silently creates a
*different, empty* local D1 instance than the one `wrangler d1 migrations apply --local`
operates on — that command resolves the database via `wrangler.jsonc`'s config, keyed off
`database_id`, not `database_name`. Confirmed by inspecting the actual `.sqlite` files
under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` with `node:sqlite`: three
different flag combinations (`--d1=DB=cjn-academy`, `--d1=DB`, no flag at all) each
produced a different, empty database file; only `--d1=DB=<database_id>` (the UUID)
resolved to the same file the config-based `migrations apply`/`execute` commands use.
Fixed in `scripts/dev-server.js` and `test/helpers/server.mjs`, documented at length in
`coach-student-system.md`'s "Local development environment" section so it isn't
rediscovered the hard way again.

**Also discovered**: on Windows, killing the top-level `wrangler`/`npx` process (e.g. via
PowerShell `Stop-Process`) does **not** kill the actual `workerd.exe` runtime process it
spawns as a grandchild — it keeps holding the port, causing confusing hangs on the next
`pages dev` invocation. Fixed by using `taskkill /PID <pid> /T /F` (kills the whole
process tree) in `test/helpers/server.mjs`'s `stopServer()`.

---

## T0.6 — Automated test harness

**Test runner**: Node 24's built-in `node --test`, zero new dependencies. `npm test` runs
`node --test --test-concurrency=1 "test/**/*.test.mjs"` — concurrency forced to 1 because
each integration test file starts/stops its own dev-server instance on a shared port
(8799), and letting Node run test files in parallel (its default) would collide.

**Coverage** (31 tests total, all passing):
- `test/unit/dates.test.mjs` (6 tests) — `isValidDate`, `dayOfWeekFor`, `addDaysIso`,
  `todayIso` including the SAST regression.
- `test/unit/auth.test.mjs` (5 tests) — password hash/verify round-trip, different salt
  per call, malformed-hash rejection (returns `false`, never throws), temp-password
  shape.
- `test/integration/login.test.mjs` (3 tests) — success sets cookie; wrong
  password/nonexistent/inactive/pending all return a byte-identical 401 response.
- `test/integration/lockout.test.mjs` (1 test) — 5 failures locks the account; correct
  password still rejected during the lock window, with the same generic error (no
  distinct "locked" message leaked).
- `test/integration/route-protection.test.mjs` (12 tests) — all 4 middlewares
  (`coach`/`student` static pages, `coach`/`student` API) × 3 cases each
  (unauthenticated, wrong role, must-change-password).
- `test/integration/rsvp.test.mjs` (4 tests) — create/delete round-trip, past-date
  rejection, and the two T0.6b regressions below.

**Exit conditions, all demonstrated**:
- `npm test` passes against a freshly seeded local DB (each integration file reseeds in
  its own `before` hook).
- Both T0.6b regression tests were shown failing before their fix and passing after (full
  before/after command output below).
- Deliberately broke one assertion (`dayOfWeekFor('2026-08-05')` expected `99` instead of
  `3`) → visible failure with exit code 1 and a clear `AssertionError` diff; reverted,
  suite green again. Proves the suite actually asserts.
- Test procedure documented in `coach-student-system.md`'s new "Automated tests" section.

### T0.6b bug #1 — timezone (`todayIso()`)

**Before fix** (regression test failing):
```
✖ todayIso() returns the SAST calendar date, not UTC (regression: T0.6b #1) (1.4751ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + '2026-08-05'
  - '2026-08-04'
```
**Fix**: `todayIso(now = new Date())` now adds a fixed `+2h` (SAST, no DST) offset before
formatting, instead of reading the Worker's UTC clock directly. Takes an optional `now`
purely so the bug is testable without mocking global time; all real call sites
(`upcoming.js`, `rsvp.js`) call it with no argument, unchanged behavior for them beyond
the actual bug fix.

**After fix**: all 6 tests in `dates.test.mjs` pass, including both boundary cases (just
after and just before SAST midnight).

### T0.6b bug #2 — RSVP day-of-week / window validation

**Before fix** (both regression tests failing):
```
✖ RSVP rejects a date whose day-of-week does not match the template (regression: T0.6b #2)
  AssertionError: 200 !== 400
✖ RSVP rejects a date outside the 7-day upcoming window (regression: T0.6b #2)
  AssertionError: 200 !== 400
```
**Fix**: `rsvp.js` now checks `dayOfWeekFor(date) === template.day_of_week` and that
`date` falls within `[todayIso(), todayIso() + 6 days]` (the same window
`student/upcoming.js` projects), rejecting with 400 otherwise.

**After fix**: all 4 tests in `rsvp.test.mjs` pass.

### Bonus fix — outside T0.6b's two named bugs

Found while writing the date-helper unit tests, not part of the plan's original two
bugs: `isValidDate('2026-02-30')` returned `true`. `Date` silently normalizes overflowing
calendar components (Feb 30 → Mar 2) instead of producing `NaN`, so the old
`!isNaN(...)` check never caught it. Fixed by round-tripping the parsed date back to a
string and comparing against the input — `d.toISOString().slice(0, 10) === dateStr`.
Low severity (RSVP writes are self-service and now additionally constrained by the
day-of-week check above; session-date writes are coach-only/trusted), but a real
data-integrity gap that existed in production. Fixed alongside bug #1 since it's the same
file already being edited for the timezone fix.

### Discrepancy — `.gitignore` unanchored patterns

While adding `public/functions/package.json` (needed so Node correctly treats the ESM
syntax in `functions/**/*.js` as ES modules when test files `import` from it directly —
see below), discovered it was silently being excluded from `git status`/`git add`
entirely. Cause: `.gitignore`'s `package.json`, `Server.js`, `package-lock.json`,
`node_modules/` entries had no leading `/`, so they matched at **any** depth in the repo,
not just the root. Originally these were presumably meant to describe the outer folder's
same-named files — but those live outside the `public/` git root entirely and were never
visible to git regardless, so the patterns were already vestigial for their stated
purpose, and actively harmful once a legitimately-different nested file needed the same
name. Fixed by anchoring all four patterns with a leading `/`. Verified
`functions/package.json` now shows correctly as untracked (`??`) after the fix.

### Other test-infrastructure notes worth recording

- `public/functions/package.json` (`{"type": "module"}`) added purely so Node's own
  module-type detection (which climbs the directory tree from the imported file looking
  for the nearest `package.json`) treats `public/functions/**/*.js` as ESM when test
  files `import` from them directly, without touching the outer folder's own
  CommonJS-based `package.json`/`Server.js`/`scripts/*.js`. Harmless for the deployed
  site: Cloudflare Pages Functions are always bundled by Wrangler's own bundler
  regardless of a stray `package.json`, and the `functions/` directory is reserved for
  Function routing, never served as a static asset.
- Test files use the `.test.mjs` extension (not `.test.js`) so they're unambiguously ESM
  without needing the outer `package.json`'s `"type"` field touched at all — keeps
  `Server.js` and the CommonJS-style `scripts/*.js` untouched.
- Seed data grew by 2 accounts beyond the plan's "several students in varying states"
  spec: `lockout1@seed.test` (reserved exclusively for the lockout test, so it doesn't
  interfere with other login tests) and `coachmustchange@seed.test` (the seeded primary
  coach never has `must_change_password` set, so the coach-side middleware test needed
  its own dedicated account). Both documented in `coach-student-system.md` with an
  explicit "never log into these manually" warning.

---

## T0.8 — Stop serving internal docs publicly

`public/functions/docs/_middleware.js` added, following the exact `getSessionUser` +
role-check pattern already proven in `functions/coach/_middleware.js` (including the
`must_change_password` redirect, for consistency, though the exit conditions didn't
explicitly require testing that case). Deliberately did **not** use `_routes.json` (it
controls Function invocation, not static-asset serving, so it can't gate a static `.md`
file) and did **not** move `docs/` out of the repo (would lose version-controlled design
rationale).

**Exit conditions, all demonstrated locally** (deployed-site verification happens at
T0.7's merge/deploy step):
- `GET /docs/coach-student-system.md` with no cookie → 302 to `/login.html`.
- Same request as a logged-in coach → 200, real document content confirmed
  (`# Coach/Student Login & Attendance System` present in the response body).
- Same request as a logged-in student → 302 to `/student/dashboard.html`.
- `git ls-files docs/coach-student-system.md` confirms the document is still tracked —
  only its public visibility changed, not its git history.
- Access method documented in `HANDOVER.md`'s new "Internal docs access" section.
- Added 3 regression tests to `test/integration/route-protection.test.mjs` (unauthenticated
  / coach / wrong-role) so this doesn't silently regress later — full suite now 34 tests,
  all passing.

No discrepancies.

---

## T0.7 — Branch convention and documentation

All three docs (`HANDOVER.md`, `TODO.md`, `docs/coach-student-system.md`) audited for
staleness: grepped for `wrangler@3` and "no test suite" claims across the whole project.
Zero hits in any living doc — the only remaining mentions are in `PLAN.md` (the task list
itself, describing this exact task by name) and this report (a completion report,
correctly in past tense). `HANDOVER.md` substantially rewritten: session narrative updated
from the stale 2026-08-04 Phase 3 description to this session's actual Phase 0 work, and
the "Branch convention" section now documents the new per-phase-branch convention this
task introduces.

`stable-phase3` reconfirmed to still resolve to `44edd134784751a00d81410822486513bc44f35f`
(unchanged by any of Phase 0's work).

Work committed on `phase-0-foundation` as 7 logically-scoped commits at this point in the
branch's history (3 more were added by the post-review fixes below — see the full list at
the end of that section). `git status` clean on the branch throughout.

**Exit conditions**: docs accurate (✅, verified above) and `stable-phase3` unmoved (✅).
**Still open**: the merge itself — `[HUMAN GATE]`, and `/code-review ultra` should run on
this branch first per PLAN.md's own guidance ("Before merging a phase branch,
`/code-review ultra`").

---

## Post-review fixes (2026-08-05, before merge)

A local max-effort code review (`/code-review ultra` requires a cloud launch outside this
session's reach; fell back to an in-session multi-agent review of the branch diff plus the
new untracked `scripts/`/`test/` tooling) produced 15 findings. Triage decision: two of
them (findings #5 pending-login test, and #7 the D1-binding hardcoding) meant **T0.6's own
exit condition was not actually met** — "deliberately breaking any one assertion causes a
visible test failure" had a real gap, since the pending-account login test could not have
caught a regression in the status check it claimed to cover. That reopened T0.6 rather
than being a nice-to-have. Full findings list and reasoning are in the conversation that
ran the review; this section records what was actually done about each one.

**Safety net, fixed first** (so the rest of the fixes below are verified by a test suite
that's actually trustworthy):
- **#5** — `pending1@seed.test` now has a known password (`PendingPass123!`) instead of an
  unguessable random one. `login.test.mjs`'s pending-account case now logs in with the
  *correct* password (mirroring the pre-existing `inactive1` case), so it actually proves
  login is blocked by `status='pending'` itself, not incidentally by a wrong password.
- **#7, #9, #10, #11** — extracted `scripts/lib/devEnv.js`, a single shared module for
  `PUBLIC_DIR`, the `wrangler.jsonc` reader, and the D1 binding/`database_id` lookup, used
  by `scripts/dev-server.js`, `scripts/db-reset-seed.js`, and `test/helpers/server.mjs`.
  Previously `test/helpers/server.mjs` hardcoded the D1 binding name as the literal `"DB"`
  while `dev-server.js` read it from config — harmless today, but exactly the kind of
  silent drift that could point the dev server and the test server at two different local
  databases if the binding were ever renamed. Verified: `require()`/`import` interop
  works (CJS module consumed from both CJS scripts and an ESM test file), `npm run dev`
  and the full integration suite both still pass.

**Correctness fixes, each with a regression test written first and shown failing**:
- **#1** — RSVP day-of-week/window validation now applies only when `going === true`
  (creating an RSVP). Cancellation (`going === false`) now requires only that the row
  belongs to the caller, matching `PLAN.md`'s corrected T0.6b wording (a spec defect found
  at this same review checkpoint: the original T0.6b task text omitted this distinction).
  Regression test inserts a mismatched-weekday row directly via SQL (bypassing the
  create-time validation, simulating either legacy data or a template whose schedule
  changed after RSVPs existed against it) and asserts the owning student can still cancel
  it. Failing before the fix (`400 !== 200`, `"Date does not match this class's weekday"`),
  passing after.
- **#2** — `rsvp.js` now rejects a non-object parsed body (e.g. literal JSON `null`, which
  parses successfully and is not a `.json()` error) with a graceful 400 instead of letting
  the unguarded `const {...} = body` destructure throw uncaught. Regression test POSTs a
  literal `null` body and asserts 400; failing before the fix (`500 !== 400`), passing
  after. **Scoped to `rsvp.js` only**, per instruction — the same pattern exists in 10
  other handlers; logged as a systemic issue in `TODO.md` rather than fixed everywhere in
  this pass.
- **#6** — `scripts/db-reset-seed.js`'s `mostRecentPastDow()` now imports and calls the
  real `todayIso()`/`addDaysIso()`/`dayOfWeekFor()` from `functions/api/_utils/dates.js`
  (Node 24 can `require()` that ES module directly — no top-level await, plain function
  exports) instead of reimplementing "today" in raw UTC. Seed data now agrees with the
  app's own SAST-aware notion of "today" instead of drifting by a day near SAST midnight.
- **#8** — `RSVP_WINDOW_DAYS` is now a single exported constant in
  `functions/api/_utils/dates.js`, imported by both `rsvp.js` and `upcoming.js`, replacing
  two independently-declared `WINDOW_DAYS = 7` literals coupled only by a comment.
- **#12** — extracted `test/helpers/auth.mjs`'s `login(email, password)`, replacing four
  near-identical local copies across `login.test.mjs`, `lockout.test.mjs`,
  `route-protection.test.mjs`, and `rsvp.test.mjs` (the last under the name `loginAs`).
  Returns `{res, cookie}`; callers read the body themselves via `res.json()`/`res.text()`
  as needed, since reading headers doesn't consume the body stream.

**#3/#4, first attempt (2026-08-05, round 1) — tried the deeper fix, believed it worked,
was wrong**: Dropped `shell: true` everywhere a wrangler CLI command is spawned, in favour
of spawning `cmd.exe /d /s /c npx wrangler <args>` on Windows as a real argv array (`npx`
is a `.cmd` shim; Node can't exec it directly without a shell, confirmed: fails with
`EINVAL`) and `npx wrangler <args>` directly on POSIX (no shell needed there, `npx` is a
real executable). The claim recorded at the time — **"this closes off finding #4's whole
bug class"** — was false, and shipped into this report, a code comment, and
`coach-student-system.md` anyway. It was caught at the next review checkpoint, not by
this round's own verification.

**#3/#4, corrected (round 2, same day, before merge)**: Empirically demonstrated the
round-1 claim was false: `spawnSync('cmd.exe', ['/d','/s','/c','node','-e','...','a&b'])`
— an argv array, exactly what round 1 shipped — still gets `a&b` split into two commands
by cmd.exe, which failed trying to run `b` as a program. Node's per-argument quoting
protects against the *target program's* standard argv parsing; it does nothing about
cmd.exe's own second-stage reparsing of its command tail after `/c`, which treats
`& | ^ % < >` as live metacharacters regardless of how the array was quoted going in, and
Node only quotes an argument at all if it contains whitespace/quotes — a bare `&` sails
through untouched. **Real fix**: added `wrangler` as an outer-folder devDependency and
resolve its actual bin script via `require.resolve('wrangler/package.json')` (robust to
`node_modules` hoisting/layout), then spawn it as `node <wrangler.js> <args>` directly —
`scripts/lib/devEnv.js`'s `wranglerCommand()`. No `cmd.exe`, no `/bin/sh`, anywhere in the
process tree, on either platform: there is no second-stage parser left to re-interpret
anything, so no escaping is needed regardless of what characters an argument contains.
Re-verified with the same attack shape that broke round 1:
`spawnSync(process.execPath, [wranglerBinPath, 'd1', 'execute', ..., '--command=SELECT
"A&echo pwned|B" AS test'])` against the real local D1 — the value came back byte-for-byte
intact, `&`/`|` never interpreted. This also pins the exact wrangler version via
`package.json` instead of `npx`'s "resolve whatever's cached or download latest" behavior,
and — as a byproduct of no longer needing `cmd.exe`/`npx` as intermediate layers —
shortens the Windows process tree by two hops, and dropped the full suite's runtime from
~105s to ~64s (no more per-invocation `npx` resolution).

All three places that asserted the false round-1 claim were corrected: this report (here),
the code comments in `devEnv.js`/`dev-server.js`/`server.mjs`, and
`coach-student-system.md`'s "Local development environment" section.

Finding #3 (POSIX process-group cleanup) still needed `detached: true` on
`test/helpers/server.mjs`'s spawn regardless of which round-2 approach was used — that
part of round 1's reasoning held up: without a shell layer, `child.pid` is the real
wrangler-running process (now `node`, previously would have been `npx`), so on POSIX it
becoming its own process-group leader is what makes `stopServer()`'s
`process.kill(-child.pid, 'SIGKILL')` reach the whole process tree.

**Finding #3's POSIX fix is still correct by inspection only — not verified.** This
project's dev machine is Windows; there is no Mac/Linux environment available in this
session to actually run the POSIX branch of `stopServer()` and confirm the process tree is
cleaned up. The reasoning (spawn without a shell + `detached:true` → child becomes its own
process-group leader → `process.kill(-pid, ...)` correctly signals the whole group) is
standard, documented Node.js `child_process` behavior — but given round 1's Windows claim
for the *same fix* turned out to be wrong despite similarly confident reasoning, this
POSIX claim should be weighted accordingly: plausible, not confirmed.

**Windows verification performed for round 2**: `npm run dev` starts and serves correctly;
`npm run db:reset` runs cleanly; the direct-`node`-invocation approach was verified against
`wrangler --version`, `wrangler d1 execute` (needs only the D1 emulation), and `wrangler
pages dev` (needs the full `workerd` runtime) individually before wiring it into
`devEnv.js`; the full suite (`npm test`, still 36 tests) passes; and after a full
integration-test run, `Get-NetTCPConnection -LocalPort 8799` shows no lingering `Listen`
state (only normal `TimeWait` teardown) and no orphaned `workerd.exe` processes remain —
confirming `stopServer()`'s Windows branch (`taskkill /T /F`, unaffected by either round of
this change) still works.

**Declined**: #13 (repeated date-parse expression in `dates.js`) and #14 (double
`todayIso()` call in `rsvp.js`, verified during review as real but not practically
exploitable — sub-microsecond race window, self-correcting). Left as-is; not worth the
churn.

**Logged to `TODO.md`, not fixed**: #15 (`resetAndSeed()` shells out to a new Node process
per integration test file instead of calling in-process) and the broader systemic version
of #2 — the same unguarded-`null`-body pattern exists in 10 other Pages Functions handlers
beyond `rsvp.js`, which is the only one this session's diff actually touched.

**Verification**: full suite green after every fix (`npm test`, 36 tests, run repeatedly
throughout this pass, not just once at the end).

Committed as 3 additional commits at this point (10 total). `git status` clean. (Note:
`scripts/lib/devEnv.js`, `test/helpers/auth.mjs`, and every test file live in the outer,
untracked folder per this repo's existing convention, so they don't appear in commit
lists, only in the working tree.) Full final commit list is at the end of the next
section, after the second checkpoint review's fixes landed too.

---

## Second checkpoint review (2026-08-05, same day) — findings and fixes

An independent second review (of the branch as it stood after the first checkpoint's
fixes) verified 36/36 tests, the `stable-phase3` tag, `main` untouched, and the production
backup present — then held the merge for four more issues:

1. **`phase-0-foundation` had no upstream — pushed.** The branch existed only on this
   machine's disk; "committed" is not "the phase exists anywhere but here." Fixed:
   `git push -u origin phase-0-foundation`. Verified: `git branch -vv` shows
   `[origin/phase-0-foundation]` tracking; `git ls-remote --heads origin` lists it at the
   same hash as local.
2. **The "closes off the whole bug class" claim was false, and shipped into three
   places.** See the "#3/#4, corrected (round 2)" subsection above for the full story: the
   round-1 fix (route through `cmd.exe /d /s /c` with an argv array) did not actually
   close the shell-metacharacter risk — `cmd.exe` reparses its own command tail
   independent of Node's argv quoting, confirmed with `A&echo` still executing `echo`.
   Fixed for real this time (wrangler is now a devDependency, invoked via
   `node <wrangler.js>` directly, no shell anywhere), re-verified empirically with the same
   attack shape, and corrected in all three places that had asserted the false claim: this
   report, the `devEnv.js`/`dev-server.js`/`server.mjs` code comments, and
   `coach-student-system.md`.
3. **`test/integration/rsvp.test.mjs:87-90` still used `shell:true` with hand-escaped
   quotes** for its direct SQL-insert regression test — never migrated to the
   `devEnv.js` pattern in round 1, flagged independently by three review angles in the
   second review. Fixed: now calls `runWrangler(['d1', 'execute', ..., `--command=${sql}`])`,
   no escaping needed at all since there's no shell to escape *for*.
4. **This report claimed T0.1–T0.4 "landed on `main` directly."** False — `main` was
   never touched; see the corrected "Branch" note at the top of this report for what
   actually happened (uncommitted working-tree edits carried onto the branch via
   `git checkout -b`, committed there later, never on `main`).

**Byproduct of fix #2**: `runWrangler()` was rewritten anyway to resolve wrangler's bin
path, and picked up a small correctness improvement in the same pass — it now checks
`result.error` before falling back to a generic `(exit ${status})` message, so a genuinely
unlaunchable command (missing `wrangler`/`node`, broken install) surfaces its real cause
instead of a confusing `(exit null)`. This was also flagged independently by the second
review as a minor finding; fixing it was incidental to fix #2, not a separate pass.

**Verification**: `npx wrangler --version` → `4.119.0` via the new direct invocation;
`wrangler d1 execute`/`wrangler pages dev` (the D1-emulation-only and
full-`workerd`-runtime cases respectively) both individually confirmed working through
`node <wrangler.js>` before wiring the change into `devEnv.js`; a literal
`A&echo pwned|B` value round-tripped intact through a real `d1 execute --command=...`
call (the exact shape that broke round 1); full suite green (`npm test`, still 36 tests,
now completing in ~64s instead of ~105s — no more per-invocation `npx` resolution);
`npm run dev` and `npm run db:reset` both re-verified working end-to-end.

Committed as 2 additional commits (`wrangler` added as an outer-folder devDependency —
`package.json`/`package-lock.json`, both untracked per this repo's convention, so that
addition doesn't appear in git history either):
```
f77ac8b docs: correct the false shell-metacharacter claim, describe the real fix
80a1928 docs: document the Phase 0 post-review fixes
95944b6 chore: share the RSVP window constant with student/upcoming.js
74a8f3d fix: RSVP validation gated to creation only; null-guard the parsed body
abcc10b docs: update coach/student system reference for Phase 0
ea99a62 chore: mark functions/ as an ES module tree for local testing
30642ca feat: gate /docs/* behind coach auth
08fca16 fix: validate RSVP date's day-of-week and the 7-day window
240bb05 fix: todayIso() used UTC instead of SAST; isValidDate accepted invalid dates
780063d chore: adopt D1 migration tracking, drop the wrangler@3 pin
c0d8419 fix: anchor .gitignore patterns to repo root
```
`git status` clean. Branch pushed and tracking `origin/phase-0-foundation` at `f77ac8b`.

**Update**: the 11 findings from that second pass (this paragraph originally listed 7 of
them as "not yet triaged") were subsequently triaged in full in
`reports/phase-0-review-triage.md`, and the resulting fix-now items were completed — see
"Round 3" below.

**T0.7 update (found at this checkpoint, recorded in `PLAN.md`)**: Phase 0 adds
`functions/package.json` to the *deployed* tree. The claim that Wrangler's bundler ignores
it was asserted during T0.6, never verified against a real deploy. T0.7 now requires a
post-deploy live-Functions smoke test after the merge lands and Cloudflare Pages deploys:
confirm a real login succeeds, one authenticated API call returns JSON, and an
unauthenticated `/coach/dashboard.html` still redirects — before the phase is called done.
Not yet performed; sequenced after the merge, which hasn't happened yet.

---

## Round 3 — triage of the 11 second-pass review findings, and their fixes

Per `reports/phase-0-review-triage.md` (full triage) and the `PLAN.md` rule adopted after
that triage: **every finding re-checked against the file and line it names, recorded here,
not taken from the fix summary.** The triage document found one finding (#3, `cjn-academy`
hardcoded outside `devEnv.js`) that a previous fix summary had dropped entirely — Confirmed,
severity-ranked third, present in neither the "fixed" nor "still open" half of that summary.
This round's own findings below are recorded the same way specifically to not repeat that.

Work order was `reports/phase-0-review-triage.md`'s Bucket 1 (fix now) and Bucket 2 (log,
don't fix), items 1–7 below in the order given to the executing agent.

### 1. `getD1Config()` now also returns `database_name`; three hardcoded `'cjn-academy'` sites use it
- **Inspected**: `scripts/lib/devEnv.js:29-38` before the fix — `getD1Config()` returned
  only `{ binding, databaseId }`. After: also returns `databaseName` (read from the same
  already-parsed `d1_databases[0].database_name`, no new file I/O).
- **Inspected**: `scripts/db-reset-seed.js:14` (import updated to include `getD1Config`),
  a new `const { databaseName } = getD1Config();` above `ITERATIONS`, and the two call
  sites — `d1 migrations apply` (was line 51) and `d1 execute --file=` (was line 200) —
  both now pass `databaseName` instead of the literal.
- **Inspected**: `test/integration/rsvp.test.mjs:8-9` (`getD1Config` destructured from
  `devEnv`, `databaseName` read at module scope) and the `d1 execute --command=` call
  (was line 89) — now passes `databaseName`.
- Binding name was deliberately **not** substituted anywhere, per the triage's explicit
  instruction — `d1 migrations apply`'s handling of a binding argument (vs. a database
  name) was never verified, only `d1 execute --local` was. All three sites still pass a
  database name, just no longer a hand-copied one.
- `cjn-academy` in `public/wrangler.jsonc:8` (the actual config value, source of truth
  now), `PLAN.md`, `README.md`, `TODO.md`, `coach-student-system.md`, and the migration
  file headers were left untouched — confirmed by re-reading the triage's explicit
  exclusion list, not by grepping and reverting hits.

### 2. `getD1Config()` throws on more than one `d1_databases` entry
- **Inspected**: `scripts/lib/devEnv.js:32-34` — added
  `if (dbs.length > 1) throw new Error(...)` before indexing `[0]`. Two lines, as
  specified; no selection mechanism added. `public/wrangler.jsonc` has exactly one
  `d1_databases` entry today, so this is currently a no-op guard, not a behavior change.

### 3. `rsvp.test.mjs` imports `RSVP_WINDOW_DAYS` instead of hardcoding `7`
- **Inspected**: `test/integration/rsvp.test.mjs:5` — `RSVP_WINDOW_DAYS` added to the
  existing `dates.js` import. The literal `7` that previously bounded the date-search
  loops (old lines 27, 81, 113) is gone; see item 4, same fix. One literal `7` remains,
  in the test titled `'RSVP rejects a date outside the 7-day upcoming window...'` (line
  50 after this round's edits) — that's a human-readable test name string, not a value
  the test logic depends on, so it wasn't touched.

### 4. Date-search loop de-duplicated into one file-local helper
- **Inspected**: `test/integration/rsvp.test.mjs` before the fix — the same 7-line
  "search up to 7 days ahead for a date matching/not-matching a day-of-week" loop was
  written out three times, at lines 27, 81, and 113.
- **Fix**: one `findDateInWindow(predicate)` helper added at `test/integration/rsvp.test.mjs:22-29`
  (bounded by `RSVP_WINDOW_DAYS`, satisfying item 3 in the same helper), and all three
  call sites — now at lines 37, 79, and 103 — replaced with a one-line call. Kept local
  to this file, not extracted to a shared test-utils module, per the triage's explicit
  instruction (the duplication was confined to one file).
- The fourth, superficially similar loop at `test/integration/rsvp.test.mjs:55-59` (the
  "far beyond the window" `while` loop, searching 70+ days out for the next matching
  weekday) was **not** touched — the triage named only lines 27/77/109 (this file's line
  numbers before this round's edits), and this loop has different bounds and a different
  purpose (proving the window is enforced, not finding *any* in-window date), so folding
  it into `findDateInWindow` would have changed its meaning, not just its shape.

### 5. New test pins the 400-before-404 validation order in `rsvp.js`
- **Inspected**: `public/functions/api/student/rsvp.js:29-46` first, to confirm the order
  is still what the triage described and reject-bucketed: the window check (line 35) runs
  before the `SELECT ... FROM class_templates` lookup (line 39) and its `404` (line 45).
  Unchanged by this round — the triage's decision (Bucket 3, reject) was to pin the
  behavior with a test, not alter `rsvp.js`, and no line in that file was edited.
- **Added**: `test/integration/rsvp.test.mjs:134-151`, `'RSVP checks the window before the
  template exists (deliberate order: 400, not 404)'` — POSTs `templateId:
  'no-such-template'` (never seeded, guaranteed absent) together with a date
  `RSVP_WINDOW_DAYS + 10` days out (guaranteed to fail the window check), and asserts
  `res.status === 400`. If the checks were ever reordered, this fails with `404` and the
  message spells out which of the two checks won.
- Ran standalone to confirm it currently passes (it does — see the full `npm test` output
  below, `RSVP checks the window before the template exists` at 190.9ms) — a passing test
  before any code change was expected here, since item 5 is "pin current behavior," not
  "fix a bug."

### 6. Comment added at `server.mjs:37` explaining `TEST_PORT=0` is unsupported
- **Inspected**: `test/helpers/server.mjs:37` before and after — the code is unchanged
  (`Number(process.env.TEST_PORT) || 8799`, not `??`). A 6-line comment was added directly
  above it (now `server.mjs:32-37`) stating why `0` must keep falling through to `8799`:
  `BASE_URL` is built from `TEST_PORT` before the server starts, and `startServer()` spawns
  with `stdio: 'ignore'`, so there is no code path by which this module could ever learn
  an OS-assigned port even if `0` were passed through.

### 7. `resetAndSeed()` per-test-file process spawn logged to `TODO.md`, not fixed
- **Inspected**: `test/helpers/server.mjs:41` — `resetAndSeed()` still `spawnSync('node',
  ['scripts/db-reset-seed.js'], ...)`, unchanged.
- **Inspected**: `TODO.md`'s existing "Logged, not fixed" bullet for this item (added at
  the previous review round) — it had gone stale: it said this was "easier to fix now that
  `devEnv.js` exists," which is exactly the re-flagging the triage document considered and
  rejected (making it in-process requires `db-reset-seed.js` to become importable, which
  opens the door to state leaking between test files — judged worse than a ~65s suite on a
  branch whose stated purpose is a trustworthy safety net). Updated in place to record the
  current decision and its reasoning rather than the superseded one, with the `server.mjs:41`
  reference added.

### Full suite, after all seven fixes
`npm test` — **37/37 passed** (36 from before this round, plus item 5's new test), 0
failures, ~62s. Full output captured in this round's work; the tail:
```
✔ RSVP checks the window before the template exists (deliberate order: 400, not 404) (190.8937ms)
...
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62206.0157
```

### Bucket 2/3/4 items from the triage — not touched, and why
Everything below was explicitly out of scope for this round; listed here only so this
report doesn't read as if they were forgotten:
- **`RSVP_WINDOW_DAYS` placement in `dates.js`** (Bucket 3, reject) — `dates.js:7` is
  unchanged; T0.6b mandated exactly this shared-constant shape.
- **`TEST_PORT=0` falsy-zero as a behavior change** (Bucket 4, decline) — only the comment
  from item 6 above was added; `|| 8799` was not changed to `??`.

---

## Summary

Phase 0 delivers exactly what it set out to: a local D1 + Pages Functions dev environment
(T0.5) with a real automated test suite (T0.6, 36 tests) sitting on top of production
housekeeping (T0.1–T0.4: rollback tag, unpinned Wrangler, backup procedure, migration
tracking) and one security-adjacent cleanup (T0.8). Four real bugs were found and fixed
with regression tests across the initial build and the first review pass (SAST timezone,
RSVP day-of-week/window validation, RSVP cancellation blocked by that same validation, a
`null`-body crash), plus two bonus fixes (invalid-date acceptance, a login test that
couldn't prove what it claimed) and several infrastructure footguns caught along the way
(`.gitignore` unanchored patterns, the `wrangler pages dev` D1-binding gotcha, a leaked
test-server process tree) that would otherwise have caused confusing failures in later
phases or for future contributors.

Two review checkpoints ran against this branch before the merge, and both earned their
keep by finding real problems the process that built the code did not catch itself:

- The **first** checkpoint found that T0.6's own exit condition ("breaking any assertion
  causes a visible failure") had a real gap — a login test that couldn't actually prove
  what it claimed — plus two genuine correctness bugs in shipped code.
- The **second** checkpoint found that the first checkpoint's own fix for a shell-quoting
  bug was *itself* wrong: a "closes off the whole bug class" claim that shipped into three
  places (this report, a code comment, and the docs) without being verified, and turned
  out to be false when actually tested. The corrected fix (`wrangler` as a devDependency,
  invoked directly via `node`, no shell anywhere) was verified with the same attack shape
  that broke the first attempt, this time before writing the confident claim rather than
  after. Also caught: an unpushed branch (Phase 0 existed on one disk), a test file that
  never got migrated to the new safe-spawning pattern, and a factual error in this report's
  own account of what had been committed where.

The pattern across both checkpoints: confident claims about correctness or completeness
are exactly the thing an independent review needs to check, not just take on the word of
whichever process produced them — including this one's own prior output. Worth carrying
forward into later phases, not just noting here.

Nothing here is user-visible yet — that starts with Phase 1's shared frontend and Phase
2's capacity/headcount work, both of which now have a local environment and test suite to
build against instead of testing live against production with disposable accounts.

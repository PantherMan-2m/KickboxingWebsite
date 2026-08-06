# Build Plan — CJN Academy Website

**Authored**: 2026-08-05 (planning session, Opus 5). **Restructured**: 2026-08-06, per
"Keeping sessions cheap" below — phase task specs live in `plan/phase-N.md`, not here.
**Intended executor**: Sonnet 5, one task at a time, in dependency order.
**Companion docs**: `HANDOVER.md` (current state, session-to-session continuity),
`TODO.md` (loose ends), `plan/codebase-map.md` (page inventory, middleware, function
tree), `public/docs/coach-student-system.md` + `coach-student-system-technical.md`
(living usage/technical reference — update as phases land).

---

## How to use this document

Read this section before executing anything.

1. **Read this file plus the current phase's `plan/phase-N.md`.** Not the task specs of
   finished phases, and never a completion report unless spot-checking a named claim —
   see "Keeping sessions cheap" below.
2. **Tasks are executed in dependency order.** Every task lists `Depends on`. A task may not
   begin until every dependency's exit condition has been met and verified. Where tasks have
   no dependency relationship they may be done in any order, but prefer numeric order.
3. **Exit conditions are literal.** A task is done when its exit condition is *demonstrated*,
   not when the code looks right. If an exit condition cannot be demonstrated, the task is not
   done — stop and report, do not proceed to the next task.
4. **`[HUMAN GATE]` tasks require Giovanni's explicit confirmation** before the action runs.
   These are: anything writing to production D1, anything pushing to the remote, and anything
   touching live Cloudflare settings. Present the exact command and wait.
5. **Never `--remote` without a current backup.** See `plan/phase-0.md`'s T0.3. This is not
   negotiable once payment records exist.
6. **Version-stamp every cacheable static asset, and bump it on every change**, on every page
   that references it — `styles.css?v=`, `app.js?v=`, and any future one. Cloudflare serves the
   HTML with `max-age=0` but gives static assets a 4-hour browser cache, so an unversioned asset
   means a bad deploy is unfixable for four hours across every page at once. This has caused
   stale-asset incidents more than once already.
7. **Work on a feature branch per phase** (`phase-1-shared-frontend`, etc.), not directly on
   `main`. See `plan/phase-0.md`'s T0.7.

### Conventions inherited from the existing codebase

Do not "improve" these without raising it first — they are deliberate:

- No build step, no bundler, no npm dependencies in the deployed site. Workers-native APIs only.
- **Git repo root is the outer project folder** (moved from `public/` in `f0c3ec8`, Phase 0).
  The deployed site is `public/`; Pages Functions live in `public/functions/`; Cloudflare Pages'
  **Root directory** setting is `public`. `scripts/`, `test/`, `reports/`, `plan/`, and
  `package.json` are tracked; `backups/` is gitignored and must never be staged — it holds real
  user data.
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
authors and amends this document, runs checkpoint reviews, triages review findings,
verifies claims against the code, and writes task specs. It does **not** edit code,
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

### Keeping sessions cheap (adopted 2026-08-06)

Token budget is now a first-class constraint, not an afterthought. Measured at the Phase 1
checkpoint: the standard opening prompt made a session read 1,587 lines (~19k tokens) before
doing anything, and adding the completion reports took it past 30k. Four standing rules:

1. **Documents are split by who needs them, and the opening prompt names only the load-bearing
   ones.** A session executing Phase N reads this file plus `plan/phase-N.md` — not the task
   specs of finished phases, and never a completion report. Reports exist to be *spot-checked
   when a specific claim is in doubt*, which is a targeted read, not a load.
2. **Completion reports are archives.** Once a phase merges, its report is never opened again
   except to check a named claim. Do not cite one as required reading.
3. **Findings get recorded as data, not re-derived.** The verified-inventory table in T1.1 was
   the original pattern: a checkpoint that discovers the page count, the middleware list, or the
   function tree writes it down so the next session greps zero times. `plan/codebase-map.md`
   holds this now.
4. **Opus is handed a packet, not a repo.** Before a checkpoint, the executing Sonnet session
   writes `reports/phase-N-checkpoint-packet.md` — what changed, what is open, the verification
   table, and the specific decisions needing judgement. Target 150 lines. Opus reads that plus
   this file's first 150 lines, and asks for more only when the packet is insufficient.

**Completion reports are mandatory and must contain evidence.** At the end of each phase, write
`reports/phase-N-completion.md` (outer folder, not the repo) recording, for every task: the
exit conditions, and the **actual command output or observed result** that demonstrates each one
— not a claim that it passed. Where a task required showing a test failing before a fix, include
both the before and after output. Note anything that turned out differently from how the
relevant `plan/phase-N.md` described it; that discrepancy list is the most valuable part of the
report, because it is what re-plans the following phases.

A checkpoint reviewer is expected to **spot-check the report against reality** rather than
accept it. A report that cannot be independently reproduced means the phase is not complete.

### Triaging review findings

Review output is **triaged before anything is fixed**, never fixed as it arrives.
Findings interact (three often share one root cause), and some are wrong. Sort into four buckets:

1. **Real bug in this phase's work** → fix now, on this branch.
2. **Real bug, pre-existing, outside this phase** → log to `TODO.md` or the phase that owns it.
   Do not expand the branch. This is the bucket that quietly wrecks phases.
3. **Deliberate decision the reviewer lacked context for** → reject; consider whether the docs
   should state it more loudly.
4. **Style preference** → decline. This codebase's conventions are the project's, not the
   reviewer's.

**Bucket 3 candidates specific to this codebase** — all deliberate, all documented in
`coach-student-system-technical.md`, none of them defects: identical generic 401s on every login
failure (user-enumeration protection); the session cookie being unsigned (the DB lookup is the
source of truth); attendance writing rows for the whole roster rather than only those present;
un-RSVP deleting the row instead of storing a "not going" state; `session_rsvps` keyed to
template+date rather than a session id; the 14-day fixed session TTL with no sliding renewal;
and "no CSRF protection" (largely a false positive — `SameSite=Lax` blocks cookies on cross-site
POSTs).

**Rank by damage to the phase's purpose, not by nominal severity.** A test that cannot fail, or
a suite that could silently run against the wrong database, outranks a more severe bug in
shipped code — because until the safety net is trustworthy, the evidence that anything *else*
got fixed is worth nothing.

**Verify counterintuitive claims empirically rather than by reasoning.** A confident "this closes
the whole bug class" survived two review passes in Phase 0 and was false; a ten-line script
settled it. A confident claim about `defer`'s execution order survived into Phase 1's task spec
and was backwards; it shipped a real bug before being caught. See `reports/phase-0-checkpoint-review.md`
and `reports/phase-1-review.md`.

**Re-derive every finding's status from the code, never from the fix summary.** Before a phase
branch merges, each review finding is re-checked against the file and line it names, and the
`file:line` inspected is recorded alongside the verdict. Status claims on both the Phase 0 and
Phase 1 branches have failed this check on first pass. Each was caught by someone re-reading
the code; none were caught by the process that produced the claim. The root cause is structural,
not carelessness: the agent that does the work also writes the report, so the report drifts from
the code. A summary is an input to this check, never a substitute for it.

**Who does the re-deriving — revised 2026-08-06, on cost.** Opus reading every named file is the
expensive way to satisfy that rule, and the model was never what made it work; *separation of
sessions* was. So the re-check is done by a **Sonnet verification session that did not write the
code and did not apply the fixes**, and its output is a table — one row per finding: the
`file:line`, the current code at that line quoted verbatim, and a verdict of live / fixed /
never-existed. Opus reads the table and spot-checks two or three rows against the code. If a
spot-check disagrees with the table, the whole table is suspect and gets redone — that is the
check on the checker, and it costs three file reads instead of thirty.

### Review policy — revised 2026-08-06, on cost

The rule used to be "`/code-review ultra` before merging every phase branch." **That is
withdrawn.** Measured on the Phase 1 branch, one `ultra` run consumed 60–70% of a five-hour
usage window. Nine phases at that price is not affordable, and Phase 1's run does not justify
it on results: the top-ranked finding was a documentation inconsistency, and the single most
valuable finding — a load-order defect that had caused the same workaround to be hand-copied
into seven files — was ranked sixth and marked only *Plausible*.

What made the Phase 0 reviews earn their keep was **independence from the author**, not the
model and not the multi-agent fan-out. A fresh session that did not write the code is
independent. So:

- **Default: a fresh Sonnet reviewer session per phase branch.** It gets the branch diff, this
  document's four-bucket rule, and the phase's exit conditions — and it must not be the session
  that wrote the code.
- **`/code-review ultra` is reserved** for phases where a missed bug costs real money, real data,
  or account security: **Phase 4** (payments), **Phase 7** (account safety), **Phase 8** (the
  first unauthenticated write endpoint). Anywhere else, ask before spending it.
- User-triggered and billed; an agent cannot launch it.

---

## Phase map

Each phase is independently shippable. Task-level detail lives in `plan/phase-N.md` — Phases
0–2 are fully specified there; Phases 3–9 are mapped at phase level only, to be detailed
just-in-time, because decisions made during earlier phases will change their shape and
over-specifying them now guarantees rework.

| Phase | Delivers | Depends on | Detail |
|---|---|---|---|
| **0** | Foundation: Node 24/Wrangler 4, migration tracking, backups, local test environment, rollback tag | — | `plan/phase-0.md` — done, merged |
| **1** | Shared `app.js` + navigation fixes across every page | 0 | `plan/phase-1.md` — done, merged, live-verified |
| **2** | Class capacity + RSVP enforcement, next-class headcount panel, attendance pre-fill from RSVP, roster search | 0, 1 | `plan/phase-2.md` — specified, not started |
| **3** | Waitlist + coach notification hook (email + optional webhook) | 2 | `plan/phase-3.md` — mapped only |
| **4** | Membership plans, payment recording, overdue flag on the attendance roster | 0, 1 | `plan/phase-4.md` — mapped only |
| **5** | Attendance intelligence: over-limit flags, dormant-student alerts, basic reporting | 2, 4 | `plan/phase-5.md` — mapped only |
| **6** | Progress notes, skill/competency grid, discipline tags | 1 | `plan/phase-6.md` — mapped only |
| **7** | Account safety: self-service password reset, login rate limiting, audit trail | 0 | `plan/phase-7.md` — mapped only |
| **8** | Public trial bookings for non-members | 2, 3, 7 | `plan/phase-8.md` — mapped only |
| **9** | Indemnity waiver, emergency contact, POPIA review | 4, 6 | `plan/phase-9.md` — mapped only |

**Your stated priority — a live headcount for the next class — lands at the end of Phase 2.**

---

## Open questions carried forward

Not blocking Phases 0–2; must be answered before the phase named. Full context in each phase's
`plan/phase-N.md`.

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

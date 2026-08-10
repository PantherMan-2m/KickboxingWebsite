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

**Every handoff prompt must say "commit your work" explicitly** (added 2026-08-09).
Repeatedly in the Phase 4 cycle — the review fix pass, the payment-history change, the
mandatory completion reports — a Sonnet session finished correct work and left it sitting
in the working tree. None of them were wrong about the code; they simply treated "done"
as "edited". An uncommitted tree is invisible to the next session, unreviewable as a
diff, and one `git clean` from gone. Name the commits wanted, and make `git status` clean
an explicit exit condition.

**Corollary — every session opens by establishing state from git, before reading any
prose** (added 2026-08-09, at the Phase 4→5 checkpoint): `git log --oneline -10`,
`git branch -v`, `git status -sb`. That checkpoint was handed a briefing stating a branch
had zero commits and a `[HUMAN GATE]` merge was still pending; git showed the work
committed, merged, pushed, and already deployed. Hand-written status — in this file, in
`plan/phase-N.md` headers, in a session briefing — describes the repo at the moment
someone typed it, and has lagged by a whole phase before. Trust the repo, then read.

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
- **Exclude `reports/` from the diff you hand the reviewer** (added 2026-08-07, after the Phase 3
  review): `git diff main...phase-N-branch -- . ':(exclude)reports/'`. A reviewer told not to read
  the completion report will still be shown its full text by any `git show` of the docs commit
  that added it, which defeats the independence the review exists for. Phase 3's reviewer hit
  this, stopped, and re-derived the fact independently — correct behaviour, but the prompt should
  not have put them there.
- **`/code-review ultra` is reserved** for phases where a missed bug costs real money, real data,
  or account security: **Phase 4** (payments), **Phase 7** (account safety), **Phase 8** (the
  first unauthenticated write endpoint). Anywhere else, ask before spending it.
- User-triggered and billed; an agent cannot launch it.
- **On a reserved-review phase, apply the production migration *after* the review, not before**
  (added 2026-08-08, after Phase 4 got this backwards). A schema finding is an edit to an
  unapplied `.sql` file if the review comes first, and a corrective migration against a live
  table if it comes second. Phase 3's order is the model — review → fix → merge → migrate →
  deploy. Phase 4's spec inverted it and the migration went to production pre-review; it cost
  nothing only because both new tables were still empty. **Phases 7 and 8 must not repeat it.**
- **The `reports/` exclusion cannot be applied to `ultra`** (noted 2026-08-07, planning Phase 4):
  the no-arg form bundles the whole local branch, so there is no diff to filter. On a reserved
  phase, get the independence by **ordering** instead — run `ultra` while the branch is green
  but carries *no committed completion report*, and write the report after the review, the
  triage, the verification table, and the merge. This inverts the usual task order and needs to
  be stated in the phase's task list, or the executing session will write the report first out
  of habit.

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
| **2** | Class capacity + RSVP enforcement, next-class headcount panel, attendance pre-fill from RSVP, roster search | 0, 1 | `plan/phase-2.md` — done, merged, live-verified |
| **3** | Waitlist + coach notification hook (email + optional webhook) | 2 | `plan/phase-3.md` — done, merged, live-verified |
| **4** | Membership plans, payment recording, overdue flag on the attendance roster, student self-view | 0, 1, 3 | `plan/phase-4.md` — done, merged, live-verified |
| **5** | Attendance intelligence: over-limit flags, dormant-student alerts, basic reporting | 2, 4 | `plan/phase-5.md` — **detailed into tasks T5.0–T5.9**, 2026-08-09 |
| **5.5** | Bookable one-off sessions: re-key `session_rsvps` so a class occurrence with no recurring template can carry RSVPs, capacity and a waitlist | 2, 3 | `plan/phase-5.5-bookable-sessions.md` — mapped only |
| **6** | Progress notes, skill/competency grid, discipline tags | 1 | `plan/phase-6.md` — mapped only |
| **7** | Account safety: self-service password reset, login rate limiting, audit trail | 0 | `plan/phase-7.md` — mapped only |
| **8** | Public trial bookings for non-members | 2, 3, **5.5**, 7 | `plan/phase-8.md` — mapped only |
| **9** | Indemnity waiver, emergency contact, POPIA review | 4, 6 | `plan/phase-9.md` — mapped only |

**Your stated priority — a live headcount for the next class — lands at the end of Phase 2.**

**Phase 5.5 was inserted 2026-08-10**, as the decimal keeps every existing `plan/phase-N.md`
reference valid. It is not optional scenery: it was discovered while scoping a UI request
(bookable extra classes) and turned out to be the same underlying problem as Phase 8 —
both need a bookable *class occurrence* that is not a recurring weekly template. Phase 8
gained a dependency on it and gets cheaper for it.

**Not every piece of work is a phase.** Small UI/display batches get a plain feature branch
and a `plan/feat-<name>.md` spec, reviewed the same way but without a phase number —
see `plan/feat-schedule-ux.md` (2026-08-10). The test is whether it changes the schema or a
write path; if it does, it is a phase.

---

## Open questions carried forward

Not blocking Phases 0–2; must be answered before the phase named. Full context in each phase's
`plan/phase-N.md`.

1. ~~**Phase 3** — notify on reaching capacity, or only on a waitlist join?~~ **Spec'd
   2026-08-07** as waitlist-join-only (`plan/phase-3.md`, decision D1), along with two further
   decisions raised at the checkpoint and not answered: capacity raises auto-promote (D2), and
   waitlisted students see their queue position (D3). All three are defaults, isolated to one
   place each, and cheap to flip — but flip them **before** T3.2, not after.
2. ~~**Phase 4** — what happens to an overdue member's RSVP?~~ **Answered by Giovanni
   2026-08-07: nothing, flag only, no enforcement anywhere.** An overdue member RSVPs
   normally, waitlists normally, and — the case `plan/phase-3.md` flagged as newly reachable
   — **is still auto-promoted off a waitlist in strict queue order**. Consequence recorded as
   a hard constraint in `plan/phase-4.md`: `_utils/waitlist.js` is not edited in Phase 4.
   Alongside it, five further real-world facts (the three plans and their prices,
   calendar-month billing, cash/EFT record-only, students see their own status) and eight
   decisions D1–D8 were settled at the Phase 3→4 checkpoint — see `plan/phase-4.md`.
3. ~~**Phase 5** — does the plan allowance count attendance or RSVPs, and over what
   window?~~ **Answered by Giovanni 2026-08-09** at the Phase 4→5 checkpoint: only
   attendance marked `present` counts, over a **weekly** window, flagged and never
   enforced; dormant is 14 days. The fact-finding paid for itself again — `0005` seeded
   "One Class / week" as `allowance_per_period = 4, period = 'month'`, which read
   literally would flag every such student OVER LIMIT in roughly a third of all months
   for attending exactly as they paid to. Decisions D1–D8 and the one still-blocked task
   (T5.7, reporting scope) are in `plan/phase-5.md`.
4. **Phase 6** — who defines the skill taxonomy, and is it editable in the UI or seeded in a
   migration? Current assumption: coach-editable in the UI.
5. **Phase 8** — does a trial booking create a `pending` user (reusing the Phase 2 approval
   flow) or a separate record? Leaning `pending` user, for reuse.
6. **Phase 9** — waiver wording is a legal question, not an engineering one. Needs a real
   answer before the phase can be built.

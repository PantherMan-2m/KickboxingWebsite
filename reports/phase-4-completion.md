# Phase 4 Completion Report

Branch `phase-4-payments`, off `main` at `846ea03` (Phase 3's merge/deploy commit).
16 commits (7 feat, 5 fix, 4 docs). Migration `0005` built and locally applied during
the branch; migration `0006` (review finding 5's fix) applied to **production** on
2026-08-09, ahead of the merge, per the sequencing correction recorded below. Merged to
`main` as a fast-forward (`c13b9d0`), pushed, and live-verified the same day. Full suite:
**172/172** at merge time (up from 115 at the end of Phase 3).

---

## What shipped

Three new tables (`membership_plans`, `memberships`, `payments`), a computed overdue
flag with no stored `is_overdue` column (D4), three payment states — `paid` / `overdue`
/ `none` (D6) — surfaced on both the attendance roster and the waitlist, a plan
catalogue and payments-ledger UI for coaches, and a read-only self-view for students.
`allowance_per_period` (D7) is stored on every plan but read by nothing yet — Phase 5
(attendance intelligence) is where it stops being dormant; this is by design, not an
oversight, and is called out here so a future reviewer doesn't flag it as dead schema.

## Sequencing correction (recorded 2026-08-08, before the review)

`plan/phase-4.md` originally had T4.10 (backup + migrate production) depend on T4.9 and
precede T4.11 (review). That is backwards — Phase 3's actual order (review → fix →
merge → migrate → deploy) is the correct model, now written into `PLAN.md`'s review
policy so Phases 7 and 8 don't repeat it. It cost nothing here only because production
carried zero rows in `memberships`/`payments` at the time `0005` was applied, verified
before and re-verified immediately before `0006` (see Step 1 below).

## `/code-review ultra` — 6 findings, 5 fixed, 2 logged

Full triage in `reports/phase-4-review-triage.md`. Fixed on the branch, ranked by damage
to the phase's purpose, each with a test written failing-first:

| Rank | Finding | Fix | Test |
|---|---|---|---|
| 1 | **6** — plan change silently dropped the price override (the money bug) | `openAssignPlanDialog` (`coach/students.html`) now pre-fills `priceOverrideCents` instead of blanking it | `test/unit/students-assign-plan.test.mjs`, 3 tests — a real vm-executed DOM test (app.js + the inline script loaded into one `vm` context), not a text/regex check, since the bug was in the client logic itself |
| 2 | **5** — concurrent POSTs could leave two open memberships | Migration `0006`'s partial unique index (`idx_memberships_one_open`) + `DB.batch()` wrapping the UPDATE+INSERT (precedent: `coach/mark-attendance.js:37-39`) + catch-and-409 on the constraint violation | `test/integration/membership.test.mjs` — DB-level constraint test, and a handler-level test with a `.batch()`-throwing DB wrapper asserting 409, not 500 |
| 3 | **4** — a backdated `start_date` could invert the open membership's `end_date` | `membership.js` now rejects (400) a `start_date` that would close the current open row before its own `start_date` | Same file, boundary-pinned (day-after accepted, exact day rejected) |
| 4 | **2** — a not-yet-started membership read `paid` | Added `AND m.start_date <= ?` to `paymentStatusForRoster`'s WHERE | `test/integration/payment-status.test.mjs`, boundary-pinned (starts-today = paid, starts-in-10-days = none) |
| 5 | **3a** — non-string `name` crashed `.trim()` with a bare 500 | `typeof body.name !== 'string'` guard in `coach/plans.js` and `coach/plans/[id].js`, matching `membership.js:19`'s style | `test/integration/plans.test.mjs`, POST and PATCH |
| 6 | **1** — `MAX(covers_end)` subquery not scoped to the membership stint | **No code change — rejected fix.** See below. | — |
| log | **3b** — same `.trim()` bug, 8 pre-existing sites | Out of scope, logged in `TODO.md` beside the existing unguarded-handler entry | — |

### Two findings traced to errors in the phase spec, not implementation drift

- **Finding 1** — `plan/phase-4.md`'s D4 expression never contemplated a
  lapse-and-rejoin. The implementation matches the spec exactly; the spec was
  incomplete.
- **Finding 4** — migration `0005` gave `payments` a `CHECK (covers_end >= covers_start)`
  but gave `memberships` no equivalent ordering constraint. Same authoring pass,
  inconsistent — not something the code introduced independently.

### Finding 1 — why the scoping fix was rejected

Scoping the `MAX(covers_end)` subquery to the membership stint (e.g.
`p.covers_start >= m.start_date`) regresses a more common case than the one it targets:
a member pays for August, is upgraded to a new plan mid-month (old membership closes,
new one starts 08-15) — scoping excludes the August payment, so the member reads
`overdue` immediately after an upgrade, having paid. The case the scoping *would* fix —
a member who paid ahead, lapsed, and re-enrolled, keeping stale prepaid credit — needs a
payment whose `covers_end` is far in the future, which cannot currently be created:
**Giovanni confirmed 2026-08-08 that billing is one month at a time, with no
multi-month prepayment.** The finding is real in the abstract and unreachable in
practice today. Recorded as a dated comment at `_utils/payments.js:44` and a `TODO.md`
entry, so a future reviewer doesn't re-propose the same regression. Revisit only if
multi-month prepayment is ever built.

## Verification gap the completion pass had to close

The separate Sonnet verification session (per `PLAN.md`'s "the fix pass does not
self-certify" rule) omitted four things from its output: finding 3b's status, finding
1's verdict, the four independent assertions `plan/phase-4.md`'s pre-review note had
flagged as must-still-hold, and the post-fix test count. Opus filled those gaps directly
before authorizing merge. Re-verified here, independently, against the actual
post-merge code on `main`:

- **Finding 3b** — confirmed still logged, not fixed: `TODO.md:159-171` lists all 8
  sites (`auth/login.js:21`, `auth/request-account.js:14`, `:15`, `coach/sessions.js:82`,
  `coach/students.js:28`, `:29`, `coach/templates.js:21`, `:22`).
- **Finding 1's verdict** — confirmed as a comment-only change: `_utils/payments.js:44-58`
  carries both no-fix reasons (the regression, and the 2026-08-08 unreachability
  confirmation), dated. `git diff` against `main`'s pre-merge state shows no behavioural
  change at that query beyond finding 2's `AND m.start_date <= ?` addition.
- **The four independent checks** (re-derived directly from the files, current line
  numbers — `plan/phase-4.md`'s own pre-review note had one of these at a stale line
  number, corrected here):
  - `test/integration/roster-payment-status.test.mjs:52` — both `roster` and `waitlist`
    arrays carry `paymentStatus`, including the overdue-and-waitlisted case.
  - `roster-payment-status.test.mjs:92` — promotion is payment-status-agnostic (an
    overdue waitlisted student is still promoted when capacity rises).
  - `roster-payment-status.test.mjs:130` — a drop-in student on the roster shows
    `"none"`, not `"overdue"`.
  - `test/integration/student-payments.test.mjs:60` — the student self-view endpoint
    rejects/ignores an attempt to read another user's payment records via a query param
    (the IDOR check).
  All four pass in the 172/172 full-suite run below, and were read directly from the
  files on `main`, not carried forward from the pre-review note's numbers.
- **Test count** — 160 pass at the pre-review checkpoint (commit `2299017`) → 172 pass
  after the 5-finding fix pass and merge (11 new/changed assertions: 3 for finding 6, 2
  each for findings 5, 4, 2, 3a).

## Step 1 — `[HUMAN GATE]` Backup, then migrate production

Run 2026-08-09, confirmed by Giovanni before the write:

- Backup: `npx wrangler d1 export cjn-academy --remote --output=../backups/cjn-academy-2026-08-09-pre-0006-migration.sql`
  (first attempt hit a transient Cloudflare API auth error, code 10000; retry succeeded).
  144 lines, 12628 bytes, contains `CREATE TABLE` for all 9 real tables plus
  `d1_migrations`, and confirms `d1_migrations` already had `0001`-`0005` applied.
- Precondition re-check: `SELECT COUNT(*) AS n FROM memberships;` on production →
  `{"n": 0}` (also visible directly in the backup: zero `INSERT INTO memberships`
  rows). Matches the free-window Opus verified on 2026-08-08.
- Applied: `npx wrangler d1 migrations apply cjn-academy --remote` →
  `0006_memberships_one_open_index.sql ✅`.
- Post-check: `wrangler d1 migrations list cjn-academy --remote` → `✅ No migrations to
  apply!`. `SELECT COUNT(*) AS n FROM membership_plans;` → `{"n": 3}`.

## Step 2 — Merge

`git checkout main && git merge phase-4-payments` — fast-forward, `2299017..c13b9d0`,
42 files changed (+2559/−95). `npm test` on `main`: **172 pass, 0 fail** (433.7s).

## Step 3 — `[HUMAN GATE]` Push

Confirmed by Giovanni. `git push origin main` → `2299017..c13b9d0  main -> main`,
triggering the Cloudflare Pages production deploy.

## Step 4 — Live verification (Giovanni, reporting to this session)

- `coach/payments.html` on the live site: the three seeded plans appear. Confirmed.
- A real payment was recorded against a real student, via `coach/students.html` (plan
  assignment, `start_date` = the day of the check) and `coach/payments.html` (the
  payment itself). The payment appears in that student's history table on
  `student/dashboard.html` ("My membership" section, top of page). Confirmed.
- **The specific overdue→paid roster-badge transition was not observed**, and this is
  expected, not a gap: the test student's membership `start_date` was the day of the
  check, so D4's grace-period `COALESCE` (a brand-new member with zero payments reads
  `paid` until `PAYMENT_GRACE_DAYS` pass with nothing recorded — the exact scenario
  `payment-status.test.mjs` pins) meant the roster already showed `paid` *before* any
  payment was recorded, and continued to show `paid` after. Giovanni confirmed this
  directly ("I have not recorded a payment yet but it says paid"). Rather than
  fabricate a transition that didn't happen, we recorded the payment anyway to verify
  the write path end-to-end (ledger write → coach roster → student's own dashboard),
  which is the more load-bearing check in practice. This also live-confirms finding 2's
  fix is correct on production: a membership starting exactly today reads `paid`, matching
  the documented D4 boundary.

## Sensitivity note for Phase 9

`backups/` now contains financial records (`amount_cents`, `method`, `covers_start`/
`covers_end`, payment notes) in addition to password hashes from Phase 0 onward. This
raises the backup directory's sensitivity beyond what Phase 0 assumed when the backup
procedure was first documented. Flagged for **Phase 9**'s POPIA review, which already
depends on Phase 4 per the phase map.

## Discrepancies from `plan/phase-4.md`

None in the shipped code — every task's exit conditions were met as specified. Two
things worth recording for future planning, both already covered above: the T4.10/T4.11
sequencing error (an authoring error in the spec, corrected mid-phase and generalized
into `PLAN.md`), and findings 1 and 4 tracing to spec/migration-authoring gaps rather
than implementation drift.

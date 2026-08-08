# Phase 4 — `/code-review ultra` triage

**Reviewed**: `phase-4-payments` vs `main`, 2026-08-08. 6 findings (3 Confirmed, 3 Plausible).
**Triaged**: same day, Opus, per `PLAN.md`'s four-bucket rule. Every finding was re-derived
from the code at the `file:line` it names before being bucketed — the reviewer's own status
labels were treated as input, never as the verdict.

**All six reproduce as described.** No never-existed rows. What changed in triage is not
*whether* they are real but *what to do about them*: one fix direction is rejected outright,
and one finding is mostly out of scope.

## Verdict table

| # | Finding | `file:line` | Re-derived | Bucket | Rank |
|---|---|---|---|---|---|
| 6 | Plan change silently drops the price override | `public/coach/students.html:185` | Confirmed — `.value = ''` unconditionally, never reads the student's existing `priceOverrideCents` | 1 | **1** |
| 5 | Concurrent POSTs leave two open memberships | `.../students/[id]/membership.js:58-67` | Confirmed — UPDATE then INSERT, two statements, no `batch()`, no constraint | 1 | **2** |
| 4 | Backdated `start_date` inverts `end_date` | `.../students/[id]/membership.js:57` | Confirmed — `addDaysIso(startDate,-1)` with no ordering guard, and no DB backstop | 1 | **3** |
| 2 | Future-dated membership reads `paid` | `_utils/payments.js:43,50` | Confirmed — the WHERE filters `end_date IS NULL` only, never `start_date <= today` | 1 | **4** |
| 3a | Non-string `name` → bare 500 (Phase 4's 2 sites) | `coach/plans.js:20`, `coach/plans/[id].js:33` | Confirmed | 1 | **5** |
| 3b | Same pattern, 8 pre-existing sites | see below | Confirmed, pre-existing | **2** | log only |
| 1 | `MAX(covers_end)` not scoped to the membership stint | `_utils/payments.js:41` | Confirmed as described — **but the implied fix is rejected**, see below | 1 (partial) | **6** |

Ranked by damage to the phase's purpose (`PLAN.md`), not nominal severity. Phase 4 exists to
record accurately who owes what, so a silent, invisible corruption of the money model
outranks a loud crash on malformed input.

## Findings 1, 2 and 5 share one root cause

All three land on `paymentStatusForRoster`'s query (`_utils/payments.js:38-46`), and the
connective tissue is that **nothing guarantees one open membership per user**. The query
assumes it; `statusMap.set()` at line 51 silently last-wins when the assumption breaks, so
finding 5 does not merely create a bad row — it makes a student's roster payment status
**nondeterministic**. Fix 5 at the database level and the query's assumption becomes
enforceable rather than hopeful. Fix them together, in this order, or 2's fix will look
correct while 5 keeps undermining it.

## Finding 1 — real, but the proposed fix is rejected

Scoping the subquery to the membership stint introduces a worse and far more common bug:

- Member pays for August (`covers_start` 2026-08-01, `covers_end` 2026-08-31).
- Coach upgrades them to Unlimited on 08-15. Old membership closes 08-14; new starts 08-15.
- Scope on `p.covers_start >= m.start_date` → the August payment is excluded → the member
  reads **`overdue` immediately after an upgrade, having paid**.

Scoping on `p.covers_end >= m.start_date` avoids that regression but does not fix the target
case either — a prepaid-then-lapsed member's old `covers_end` still counts. **There is no
clean predicate**, because the real question is a business one:

> If a member paid ahead and then lapsed, does that credit carry over when they re-enroll?

### Answered by Giovanni, 2026-08-08 — the edge is currently unreachable

> "If a member pays for a month and then only shows for half a month, they don't get the
> other half. We don't have payments for months at a time anyway. Not now."

So: **billing is one month at a time, and multi-month prepayment does not happen.** The
lapse-and-rejoin-with-prepaid-credit scenario requires a payment whose `covers_end` is far
in the future, which cannot currently be created. The finding is real in the abstract and
**unreachable in practice today**.

This also confirms the date-range model is the right one: coverage is a *period*, not a
balance of classes owed. Attending half a month earns no carry-over.

**Action**: no code change, now for two reasons rather than one — the proposed fix regresses
a common case, *and* the case it targets cannot arise. Add a comment at `payments.js:41`
recording the edge, the rejected fix with its regression, and this confirmation with its
date, so the next reviewer does not re-propose it. Add the `TODO.md` line. Revisit only if
multi-month prepayment ever starts.

This is `PLAN.md`'s "verify counterintuitive claims empirically rather than by reasoning"
applying to a *reviewer's* reasoning: the finding is sound, the inference to a fix is not.

## Finding 3 — mostly bucket 2

`grep -rn "|| '')\.trim()" public/functions/` returns **10 sites**. Only two are Phase 4's.

- **Bucket 1, fix now**: `coach/plans.js:20`, `coach/plans/[id].js:33`.
- **Bucket 2, log and leave**: `auth/login.js:21`, `auth/request-account.js:14`,
  `auth/request-account.js:15`, `coach/sessions.js:82`, `coach/students.js:28`,
  `coach/students.js:29`, `coach/templates.js:21`, `coach/templates.js:22`.

The eight are the same family as `TODO.md`'s existing bare-500-on-malformed-input entry and
predate this phase. **Do not expand the branch to cover them** — this is the bucket
`PLAN.md` names as the one that quietly wrecks phases. Add them to `TODO.md` beside the
unguarded-handler list.

## Two of these were errors in the phase spec, not implementation drift

Recorded so the completion report attributes them correctly:

1. **Finding 1** — `plan/phase-4.md`'s D4 expression never contemplated a lapse-and-rejoin.
   The implementation matches the spec exactly; the spec was incomplete.
2. **Finding 4** — `0005` gave `payments` a `CHECK (covers_end >= covers_start)` but gave
   `memberships` no equivalent ordering constraint. Same authoring pass, inconsistent.

## Migration `0006`

Finding 5's fix is a partial unique index, which SQLite supports:

```sql
CREATE UNIQUE INDEX idx_memberships_one_open ON memberships(user_id) WHERE end_date IS NULL;
```

**Keep `0006` to this index alone.** It is purely additive and applies cleanly right now —
production was verified at `{plans: 3, memberships: 0, payments: 0}` on 2026-08-08, so there
are no duplicate rows to reject it. SQLite cannot `ALTER TABLE ADD CONSTRAINT`, so adding
finding 4's `CHECK` would require a full table rebuild; that is disproportionate. Enforce
the inversion guard in `membership.js` instead, where the error message is useful anyway.
Record the `memberships`/`payments` constraint asymmetry as known, and add the `CHECK` only
if a rebuild ever happens for an independent reason.

**Re-verify `SELECT COUNT(*) FROM memberships` is still 0 immediately before applying
`0006` to production.** The window in which this is free closes the moment a real membership
is recorded.

## Fix notes

- **6** — `openAssignPlanDialog` must receive and pre-fill the student's current
  `priceOverrideCents` rather than blanking the field. Confirm `GET /api/coach/students`
  actually returns it; if not, that endpoint needs it first. A test must assert that
  changing a discounted member's plan preserves the discount — this is the money bug.
- **5** — partial unique index **plus** wrapping the UPDATE+INSERT in `DB.batch()`.
  Precedent with an explanatory comment already exists at
  `coach/mark-attendance.js:37-39`. With the index in place the losing concurrent request
  will violate the constraint, so catch it and return a **409**, not an uncaught 500.
- **4** — reject a `start_date` that would set the open membership's `end_date` earlier than
  its own `start_date`. 400 with a clear message.
- **2** — add `AND m.start_date <= ?` (today) to the WHERE at `payments.js:43`. A membership
  that has not started is `none`, per D6's definition of "no active membership".
- **3a** — `typeof body.name !== 'string'` guard before `.trim()`, matching how
  `membership.js:19` already type-checks `plan_id`.

Every fix above needs a test written **failing first**, per `PLAN.md` rule 3.

## After the fixes

Per `PLAN.md`, the fix pass does **not** self-certify. A separate Sonnet verification
session — one that neither wrote the code nor applied these fixes — re-derives each row of
the table above from the code and produces `file:line` / verbatim code / verdict. Opus
spot-checks two or three rows. Only then: merge, apply `0006`, deploy, and write
`reports/phase-4-completion.md`.

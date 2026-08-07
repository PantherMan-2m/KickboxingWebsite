# Phase 4 — Membership plans, payment recording, overdue flag

**Status**: Detailed into tasks 2026-08-07 at the Phase 3→4 checkpoint (Opus). Depends on
Phases 0, 1 (and in practice on Phase 3's roster/waitlist queries, which T4.6 extends).
**Branch**: `phase-4-payments`. **Next migration number**: `0005`.

`/code-review ultra` **is reserved for this phase** — see `PLAN.md`'s "Review policy" and
T4.11. It is user-triggered and billed; an agent cannot launch it.

`PLAN.md` rule 5 ("never `--remote` without a current backup") **goes live in this phase**.
From T4.10 onward the production database holds payment records, and the clause stops being
advisory. See T4.10.

---

## Real-world facts, confirmed by Giovanni 2026-08-07

These were asked before any design work, because a plan model invented to be elegant and then
retrofitted to the business is this phase's expensive failure mode. Do not re-derive or
"improve" these — they are the business, not a design choice:

1. **Three plans, exactly as the public pricing page lists them** (`index.html:161-181`):

   | Plan | Price | Allowance | Period |
   |---|---|---|---|
   | Drop-in | R150 | 1 | session |
   | One Class / week | R550 | 4 | month |
   | Unlimited | R800 | — (unlimited) | month |

   Seeded by migration `0005`, coach-editable afterwards. The public pricing page is already
   correct and needs **no** copy change this phase.
2. **Family discounts** exist and are per-member, not a plan of their own → a nullable
   price override on the membership row (D3 below).
3. **Billing cycle is the calendar month.** Everyone is due for August, September, and so on
   — not an anniversary of their join date.
4. **Money arrives as cash or EFT, out-of-band. The site records it; it never takes it.**
   No gateway, no card data, no PCI scope.
5. **Students see their own payment status** (added to the phase at Giovanni's request — this
   is T4.8, and it is the one scope item beyond what `PLAN.md`'s phase map listed).
6. **Overdue is a flag, with no enforcement anywhere.** See D5.

## Decisions taken at this checkpoint

Each is a default that is cheap to flip **before** the task that builds it, and expensive
after. Same convention as Phase 3's D1–D3.

- **D1 — Money is stored as integer cents (`amount_cents`, `price_cents`), never a float
  or a formatted string.** R550 is `55000`. Rand/cents formatting happens in the UI layer
  only. This is a new convention for this codebase; it is recorded in
  `plan/codebase-map.md` by T4.9. Flip cost after T4.1: a data migration.
- **D2 — A plan's `period` is `'month'` or `'session'`. Only a `'month'` plan can back a
  membership.** Drop-in is `period='session'`: it exists so a *payment* can reference it,
  but it never creates a membership row and a drop-in student is therefore never "overdue"
  — they are "no plan". Enforced by a `CHECK` in T4.1 and a guard in T4.4.
- **D3 — The family discount is `memberships.price_override_cents`, nullable.** Effective
  price is `COALESCE(memberships.price_override_cents, membership_plans.price_cents)` —
  deliberately the same COALESCE-override idiom as Phase 2's effective capacity
  (`plan/codebase-map.md`, "Effective capacity resolution rule"), so there is one override
  pattern in this codebase rather than two.
- **D4 — Overdue is computed, never stored.** There is no `is_overdue` column and no cron
  job. It is derived per request from the payments a member has, so it can never go stale.
  The rule is one expression, defined once in `_utils/payments.js` (T4.2):

  ```
  effective_paid_through = COALESCE(MAX(payments.covers_end), date(memberships.start_date, '-1 day'))
  overdue                = effective_paid_through < date(today, '-' || PAYMENT_GRACE_DAYS || ' days')
  ```

  The `COALESCE` to the day before the membership started is what makes a brand-new member
  who has not paid yet **not** instantly overdue, while a member who joined three months ago
  and never paid **is**. This is the single subtlest line in the phase — T4.2 pins both
  halves with tests.
- **D5 — `PAYMENT_GRACE_DAYS = 7`.** A member has until the 7th of the month to pay for that
  month. A hardcoded, named, commented constant in `_utils/payments.js` — **not** an env var
  and not a settings row. There is no configuration surface for it and none is wanted;
  adding one is scope creep.
- **D6 — Three payment states, not two: `paid` / `overdue` / `none`.** `none` means "has no
  active membership" (never enrolled, drop-in only, or membership ended). It is
  informational, styled distinctly from `overdue`, and is **not** a red flag — conflating it
  with overdue would paint every drop-in and every brand-new student red on day one.
- **D7 — `allowance_per_period` is stored in this phase and read by nothing.** Enforcing "4
  classes a month" is **Phase 5** (attendance intelligence, over-limit flags), which
  `PLAN.md` already lists as depending on Phase 4. Do not build over-limit logic here.
  The column is deliberately dormant — say so in the completion report so a reviewer does
  not flag it as dead schema.
- **D8 — No speculative gateway columns.** `plan/phase-4.md` previously promised a schema a
  gateway "could attach later without a rewrite". Giovanni did **not** ask for gateway
  seams, so we are not adding `provider` / `external_ref` / `status` columns that nothing
  writes. The record-only shape stays naturally gateway-compatible (`method` is a widenable
  `CHECK` list, and `note` absorbs a reference number) without carrying dead columns for a
  phase that may never come. Adding them later is one `ALTER TABLE`.

## Settling `PLAN.md`'s open question 2, and Phase 3's carry-forward

**Open question 2 — what happens to an overdue member's RSVP? Answer: nothing. Flag only,
no enforcement.** Confirmed by Giovanni 2026-08-07; `PLAN.md`'s standing assumption stands
and its open-questions list is updated accordingly. Concretely:

- An overdue member can RSVP exactly as before.
- An overdue member can join a waitlist exactly as before.
- **An overdue *waitlisted* member is still auto-promoted, in strict queue order.** This is
  the state `plan/phase-3.md`'s "Carried into Phase 4" note flagged as newly reachable, and
  it is now a deliberate decision rather than an emergent one.

**Therefore `_utils/waitlist.js` must not be edited in this phase.** Promotion does not read
payment state; `promoteWaitlist()`'s ordering stays `(created_at, user_id)` and nothing else.
If a task in this phase has you opening `waitlist.js`, stop — either the task is wrong or
the decision is being changed, and both are Giovanni's call, not the executing session's.
The only Phase 3 surface Phase 4 touches is the **read** side: the roster and waitlist
arrays in `coach/sessions/[id].js`'s GET (T4.6).

## What Phase 3 changed about this phase's shape

Reviewed at the checkpoint; four things carry over.

1. **The roster query T4.6 extends is the one T3.7 just extended**
   (`api/coach/sessions/[id].js`, the `GET`). It now returns *two* lists of students —
   `roster` (all active students) and a separate `waitlist` array. **The overdue flag has to
   be applied to both.** Attaching it only to `roster` is the obvious mistake here, and it
   would silently hide exactly the overdue-and-waitlisted case this phase was asked to
   decide about. T4.6's exit condition tests both arrays.
2. **`parseJsonBody` from the start, as `sessions/[id].js`'s PATCH did.** All new handlers
   in this phase are built with it. Additionally, T4.4 opens `api/coach/students/[id].js`,
   which is one of the seven still-unguarded handlers logged in `TODO.md` — discharge that
   one while it is open (the "fixed file-by-file as phases open them" rule). Do not go
   fixing the other six; that is bucket 2.
3. **Version-stamp rule 6 bites this phase, unlike Phase 3.** An overdue badge needs CSS,
   so `styles.css?v=4` → `?v=5` **on all 12 pages**. Phase 3 needed no bump and so is not a
   precedent. See T4.9.
4. **The nav-markup fact, verified 2026-08-07**: all 6 coach pages
   (`dashboard`, `students`, `requests`, `templates`, `attendance`, `session`) carry a
   byte-identical `<nav id="primary-nav" class="nav-links">` block. Adding the Payments link
   is one consistent single-line insertion per file, not six bespoke edits.

---

## Tasks

Dependency order. Exit conditions are literal — a task is done when its exit condition is
*demonstrated*, not when the code looks right (`PLAN.md`, rule 3).

### T4.0 — Housekeeping and branch setup
**Depends on**: nothing.

Three unrelated bits of decks-clearing, bundled so they cost one context each.

1. **`[HUMAN GATE]` Push the outstanding Phase 3 docs commit.** `main` is ahead of
   `origin/main` by 1 (`846ea03 docs: Phase 3 done, merged, deployed, live-verified`).
   Present `git push origin main` and wait for confirmation.
2. **Delete the stale dev-server bundles**: `public/.wrangler/tmp/` holds 673 entries /
   87 MB of accumulated `bundle-*` dirs. Gitignored and harmless, but noisy in every
   filesystem grep.
   **Delete `public/.wrangler/tmp/` only — never `public/.wrangler/` itself.**
   `public/.wrangler/state/d1` (47 MB) *is* the local D1 database the test suite and
   `npm run dev` run against; removing it throws away local data and forces a
   `npm run db:reset`.
3. **Gitignore check — already correct, verify and move on.** `.gitignore:3` is
   `.wrangler/`, which has no leading slash and so matches at any depth;
   `git check-ignore -v public/.wrangler/tmp` confirms the match. **No `.gitignore` change
   is needed** — do not add a redundant `public/.wrangler/` line.
4. Branch: `git checkout -b phase-4-payments` off `main`.

**Exit conditions**
- `git status -sb` shows `## main...origin/main` with no ahead/behind marker.
- `ls public/.wrangler/tmp | wc -l` returns 0 or the directory is absent, **and**
  `ls public/.wrangler/state/v3/d1` still lists content.
- `npm test` still passes unchanged (proves the local D1 survived).
- `git branch --show-current` returns `phase-4-payments`.

### T4.1 — Migration `0005`: plans, memberships, payments (local only)
**Depends on**: T4.0.

`public/migrations/0005_memberships_payments.sql`. Three tables plus the seed. Applied to
**local only** in this task — production is T4.10.

```sql
CREATE TABLE membership_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),   -- D1: integer cents, never a float
  allowance_per_period INTEGER,                            -- NULL = unlimited. D7: dormant this phase.
  period TEXT NOT NULL CHECK (period IN ('month','session')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  start_date TEXT NOT NULL,                                -- 'YYYY-MM-DD'
  end_date TEXT,                                           -- NULL = ongoing
  price_override_cents INTEGER CHECK (price_override_cents IS NULL OR price_override_cents >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_memberships_user ON memberships(user_id, end_date);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT REFERENCES membership_plans(id),            -- nullable: informational, not a FK to a membership
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','eft')),   -- D8: widenable CHECK, no gateway columns
  paid_on TEXT NOT NULL,                                   -- 'YYYY-MM-DD', when the money actually arrived
  covers_start TEXT NOT NULL,                              -- 'YYYY-MM-DD'
  covers_end TEXT NOT NULL,                                -- 'YYYY-MM-DD', inclusive
  note TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),          -- audit: which coach typed it in
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (covers_end >= covers_start)
);
CREATE INDEX idx_payments_user_covers ON payments(user_id, covers_end);
```

Seed the three plans (fixed ids — `plan_dropin`, `plan_weekly`, `plan_unlimited` — so tests
and the seed script can reference them without a lookup):
`('plan_dropin','Drop-in',15000,1,'session')`,
`('plan_weekly','One Class / week',55000,4,'month')`,
`('plan_unlimited','Unlimited',80000,NULL,'month')`.

**Note the deliberate asymmetry**: `memberships` has no `status` column — an ended
membership is one with `end_date` set. Adding a status that can disagree with `end_date` is
how this table grows two sources of truth.

**Exit conditions**
- `npx wrangler d1 migrations list <db> --local` shows zero pending.
- `SELECT id, name, price_cents, allowance_per_period, period FROM membership_plans` returns
  exactly the three rows above, output pasted into the completion report.
- Inserting a payment with `covers_end < covers_start` fails the CHECK; inserting one with
  `method='card'` fails the CHECK. Both demonstrated.
- `npm run db:reset` completes and re-seeds cleanly (the reset path picks up `0005`).
- `npm test` passes unchanged.

### T4.2 — `_utils/payments.js`: the status rule, in one place
**Depends on**: T4.1.

The whole phase's business logic, isolated and unit-tested before any endpoint uses it.
Export:

- `PAYMENT_GRACE_DAYS = 7` (D5) — named, commented with the "until the 7th of the month"
  rationale.
- `effectivePriceCents(membership)` — the D3 COALESCE.
- `paymentStatusFor(...)` / a batch query helper returning `'paid' | 'overdue' | 'none'`
  per user id (D6), implementing D4's expression.
- `formatRands(cents)` if a server-side formatter is needed; otherwise leave formatting to
  the client and say so.

**The batch helper is the important one.** T4.6 needs the status of every student on a
roster; it must be **one grouped query for the whole roster**, not one query per student —
the same discipline T3.5 applied when a template capacity change touched many dates
(`plan/codebase-map.md` records that as a grouped `DISTINCT`, "not a loop").

**Exit conditions** — unit tests in `test/unit/`, each written to fail first:
- A member with no membership row → `none`.
- A drop-in-only payer (payments exist, no membership) → `none`, **not** `overdue`.
- A member who joined today with zero payments → `paid` (the D4 `COALESCE` branch).
- A member who joined 90 days ago with zero payments → `overdue`.
- A member paid through the end of the current month → `paid`.
- A member last covered through the previous month, on day 7 → `paid`; on day 8 → `overdue`
  (both sides of the grace boundary, pinned).
- A membership with `end_date` in the past → `none`, regardless of payments.
- `effectivePriceCents` returns the override when set and the plan price when `NULL`.
- The batch helper issues one query for an N-student roster (assert on call count or on the
  generated SQL, whichever the existing test helpers make natural).

### T4.3 — Plan catalogue API
**Depends on**: T4.1.

`api/coach/plans.js` (GET, POST) and `api/coach/plans/[id].js` (PATCH). `parseJsonBody` on
every write. PATCH is a **partial update** (`name` / `price_cents` / `allowance_per_period`
/ `active`, at least one required) — follow `templates/[id].js`'s established partial-update
shape rather than inventing a second convention.

Validation lives in a `parsePlan`-style helper next to `parseCapacity`'s precedent:
`price_cents` must be a non-negative safe integer (reject floats, strings, `NaN`,
`Infinity`); `allowance_per_period` is `null` or a positive integer; `period` is set at
creation and **immutable** afterwards (changing a plan from `month` to `session` would
orphan live memberships — reject with 400).

**Exit conditions**
- Integration tests: create / list / patch each field / reject a float price / reject a
  negative price / reject a `period` change / 404 on an unknown id / 400 on a `null` body.
- Deactivating a plan (`active=0`) does **not** delete or alter existing memberships —
  demonstrated by a test.

### T4.4 — Membership assignment
**Depends on**: T4.2, T4.3.

`api/coach/students/[id].js` gains membership handling (or a sibling
`api/coach/students/[id]/membership.js` if that keeps the handler readable — executing
session's call, but say which and why in the report).

Rules:
- Assigning a `period='session'` plan (Drop-in) is a **400** (D2) — a drop-in is paid for,
  not enrolled in.
- A student has at most one membership with `end_date IS NULL` at a time. Assigning a new
  plan closes the current one (`end_date` = day before the new `start_date`) in the same
  statement sequence; it does not leave two open rows.
- `price_override_cents` is optional (the family discount, D3).
- `created_by` = the acting coach's id, from the session.

**While this file is open, add `parseJsonBody` to its existing PATCH** — it is one of the
seven unguarded handlers in `TODO.md`. Only this one.

UI on `coach/students.html`: each student row shows their current plan (or "No plan") and
gets an assign/change control. Reuse the existing search/filter list rather than adding a
second student list.

**Exit conditions**
- Integration tests: assign / change (old row closed, exactly one open row remains — assert
  the count) / reject Drop-in / override price / 400 on a null body (the newly guarded PATCH).
- `grep -n "parseJsonBody" public/functions/api/coach/students/\[id\].js` returns a hit.
- Browser: assign a plan to a seeded student and see it reflected after reload.

### T4.5 — Payments ledger: API and coach page
**Depends on**: T4.2, T4.3.

`api/coach/payments.js` (GET list with a `?userId=` filter, POST record) and the new page
`public/coach/payments.html` — record form plus a recent-payments ledger, and the plan
catalogue editor from T4.3.

POST validation: `amount_cents` a positive safe integer; `method` in `('cash','eft')`;
`paid_on` / `covers_start` / `covers_end` each `isValidDate()`-checked (reuse
`_utils/dates.js`, do not hand-roll); `covers_end >= covers_start`; `user_id` must exist and
be a student. `recorded_by` comes from the session — **never** from the request body.

The form defaults `covers_start` / `covers_end` to the current calendar month (D-3 fact:
calendar-month billing) and `paid_on` to today via `sastTodayIso()` — the browser-side SAST
helper in `app.js`, **not** a bare `new Date()`, which `plan/codebase-map.md` flags as the
live third notion of "today".

**Nav**: add `<a href="/coach/payments.html">Payments</a>` to the identical nav block in all
6 coach pages (see "What Phase 3 changed", point 4).

**Exit conditions**
- Integration tests: record a payment / reject a body-supplied `recorded_by` (assert the row
  stores the session's coach, not the body's value) / reject a bad method / reject
  `covers_end < covers_start` / reject an invalid date / reject a non-student user id / 400
  on a null body.
- `grep -c 'coach/payments.html' public/coach/*.html` shows the link present in all 6.
- Browser: record a payment against a seeded student, see it in the ledger after reload,
  and see that student's status flip from `overdue` to `paid` on the roster.

### T4.6 — Overdue flag on the attendance roster
**Depends on**: T4.2, T4.5.

The phase's actual point. Extend `api/coach/sessions/[id].js`'s GET so **both** returned
arrays carry the status:

- every `roster` row gains `paymentStatus: 'paid' | 'overdue' | 'none'`;
- every `waitlist` row gains the same field.

Use T4.2's **batch** helper — one additional query for the whole page, not one per student.
Render on `coach/session.html` as a badge beside the name in both lists. The badge is
informational only: it must not disable the present checkbox, must not reorder either list,
and must not alter the waitlist's queue order (D5 / the no-enforcement decision).

**Exit conditions**
- Integration test asserting `paymentStatus` on a `roster` row.
- **Integration test asserting `paymentStatus` on a `waitlist` row** — the overdue *and*
  waitlisted case, the one Phase 3 flagged as newly reachable. This test is the phase's
  headline assertion; do not let it be folded into the roster test.
- A test proving an overdue waitlisted student is **still promoted** when capacity rises —
  i.e. promotion order is unaffected by payment state. Assert against
  `_utils/waitlist.js`'s existing behaviour with **no change to that file**;
  `git diff main...phase-4-payments -- public/functions/api/_utils/waitlist.js` must be empty.
- A drop-in student on the roster shows `none`, not `overdue`.
- Query count: adding the flag adds exactly one query to the GET, demonstrated.

### T4.7 — Student self-view
**Depends on**: T4.2.

`api/student/payments.js` (GET) returning the calling student's own plan, effective price,
payment history, and current status. A section on `student/dashboard.html` showing it.

**Scope this tightly**: read-only, own records only. The endpoint must derive the user from
the session and must **not** accept a `userId` parameter — an IDOR here exposes another
member's payment history.

**Exit conditions**
- Integration test: a student sees their own records.
- **Integration test: the endpoint ignores/rejects any attempt to read another user's
  records** (pass another user's id however the route would plausibly accept it and assert
  the response is the caller's own data or a 4xx — never the other student's).
- A student with no membership gets a clean empty state, not an error.

### T4.8 — Styling and the version bump
**Depends on**: T4.6, T4.7.

Badge CSS for the three states (D6) — `overdue` visually distinct from `none`; do not rely
on colour alone (a red dot and a grey dot are the same dot to a colourblind coach — include
the word). Any `app.js` additions go in the shared file, not per-page.

**Then, per `PLAN.md` rule 6**: bump `styles.css?v=4` → `?v=5` on **all 12 pages**, and
`app.js?v=2` → `?v=3` **only if `app.js` actually changed**.

**Exit conditions**
- `grep -rn "styles\.css?v=" public | grep -v "v=5"` returns nothing.
- `grep -rc "app\.js?v=" public` accounts for all 12 pages at a single consistent version.
- Both counts pasted into the completion report.

### T4.9 — Documentation
**Depends on**: T4.1–T4.8.

- `public/docs/coach-student-system.md` — how to record a payment, assign a plan, read the
  roster badge.
- `public/docs/coach-student-system-technical.md` — the three tables column-by-column (this
  is where schema detail lives; `codebase-map.md` stays structural), the D4 overdue
  expression, and D5's grace constant.
- `plan/codebase-map.md` — page inventory (+`coach/payments.html`, now 13 pages), the
  function tree (+`_utils/payments.js`, the new routes), the HTTP verb table, the migration
  list (`0005`, next number `0006`), asset versions, and a new "Non-obvious behaviours"
  entry for **D1 (integer cents)** and **D4 (overdue is computed, never stored)**.
- `TODO.md` — strike `students/[id].js` off the seven-unguarded-handlers list (six remain).

**Do not write `reports/phase-4-completion.md` yet.** See T4.11.

### T4.10 — `[HUMAN GATE]` Backup, then migrate production
**Depends on**: T4.9, and on the branch being green.

**This is the task `PLAN.md` rule 5 was written for.** From here on the production database
contains payment records, and "never `--remote` without a current backup" is not negotiable.

1. Take a fresh backup per T0.3 into `backups/` (gitignored — **never stage it**; it now
   holds payment records as well as password hashes).
2. Verify the backup is non-empty and readable *before* touching production.
3. Present the exact `wrangler d1 migrations apply ... --remote` command and **wait** for
   Giovanni's explicit confirmation.
4. After applying: `wrangler d1 migrations list --remote` shows zero pending, and a
   `SELECT COUNT(*) FROM membership_plans --remote` returns 3.

Note for the report: the backup file now contains financial records, which raises its
sensitivity. Flag it for **Phase 9**'s POPIA review — that phase already depends on Phase 4.

### T4.11 — Review, then merge
**Depends on**: T4.10.

**`/code-review ultra` is reserved for this phase** and it is Giovanni who runs it — an
agent cannot launch it, and must not try.

**Sequencing matters, and this is a process finding from Phase 3.** `PLAN.md`'s
2026-08-07 rule says to exclude `reports/` from the diff handed to a reviewer, because a
`git show` of the docs commit hands the reviewer the completion report and defeats the
review's independence. **The no-arg `/code-review ultra` bundles the whole local branch, so
that exclusion cannot be applied to it.** The fix is ordering, not filtering:

1. Branch complete, `npm test` green, T4.10 done — **with no completion report committed**.
2. Giovanni runs `/code-review ultra` on `phase-4-payments`.
3. Triage the findings into `PLAN.md`'s four buckets before fixing anything.
4. Fix bucket 1 on the branch.
5. A **separate** Sonnet verification session — one that neither wrote the code nor applied
   the fixes — re-derives each finding's status from the file and line it names and produces
   the verdict table (`file:line`, code quoted verbatim, live / fixed / never-existed).
6. Opus spot-checks two or three rows, then merge.
7. **Only then** write `reports/phase-4-completion.md` and
   `reports/phase-4-checkpoint-packet.md` (target 150 lines).

**Exit conditions**
- `npm test` green, count recorded (Phase 3 finished at 115).
- The verdict table exists and its spot-checks hold.
- Merged to `main`, deployed, and live-verified: record one real payment against production
  and confirm the roster badge changes.

---

## Carried into Phase 5

Phase 5 (attendance intelligence) is where `allowance_per_period` (D7) stops being dormant:
"4 classes a month" becomes an over-limit flag. The counting question Phase 5 must answer —
and Phase 4 deliberately does not — is whether the allowance counts *attendance* rows or
*RSVPs*, and how a waitlisted-then-promoted class counts. Phase 4's `period='month'` +
calendar-month billing (fact 3) gives that count a well-defined window to run over.

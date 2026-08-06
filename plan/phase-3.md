# Phase 3 — Waitlist and coach notifications

**Status**: Specified. Ready for a Sonnet execution session.
**Detailed**: 2026-08-07 at the Phase 2 → 3 checkpoint (Opus), against the code as it stands
on `main` at `8552e87`. Phase 2 is merged, deployed, and live-verified; migration `0003` is
applied to production.

**Goal**: a full class stops being a dead end. Students join a waitlist instead of being
rejected, the oldest waitlisted student is promoted automatically when a spot opens, and the
coach finds out without watching the site.

**Branch**: `phase-3-waitlist`. **Reviewer**: a fresh Sonnet session that did not write the
code (Phase 3 is *not* on `/code-review ultra`'s reserved list — see `PLAN.md`'s review policy).

---

## Facts established at the checkpoint — do not re-derive

Read these before starting. Items 1 and 2 are the reason this file was rewritten rather than
extended; the version of this phase written in 2026-08-05 is wrong on both.

1. **The last-spot race is already solved, and the previously specified fix is now a
   regression.** The original spec said to "insert, re-count, demote anyone past capacity by
   `created_at`". Do **not** build that. T2.3 shipped an atomic conditional insert
   (`student/rsvp.js:79-86`) — the capacity check lives *inside* the INSERT statement, so two
   requests racing for the last spot cannot both succeed, and no demotion pass is needed.
   Insert-then-demote would be strictly worse: it tells a student they are in and then takes it
   away. **Principle for this phase: a student with `status = 'going'` is never demoted, by any
   code path, ever.** Every capacity decision is made inside a single SQL statement, the same
   way T2.3 does it.

2. **Adding `status` to `session_rsvps` silently breaks four capacity calculations** unless
   every one is filtered in the same commit. Today every reader counts `COUNT(*)` over the
   whole table, because every row means "going". The moment waitlisted rows share the table,
   an unfiltered count means a waitlisted student consumes a capacity slot, inflates the
   coach's headcount, and gets pre-ticked as present on the attendance roster. The complete
   list, grepped 2026-08-07:

   | Site | Line | What breaks if unfiltered |
   |---|---|---|
   | `api/student/rsvp.js` | 82 (inner `COUNT(*)` of the atomic insert) | waitlisted students consume capacity; class fills at half strength |
   | `api/student/upcoming.js` | 28 (grouped counts → `attending`, `full`) | every student sees a wrong count and a wrongly-full class |
   | `api/coach/next-class.js` | 30 (`COUNT(*)` → dashboard panel) | the headline Phase 2 feature over-reports |
   | `api/coach/sessions/[id].js` | 43 (`SELECT user_id` → T2.5 attendance pre-fill) | waitlisted students arrive pre-marked present |

   `rsvp.js:46` and `:93` (existence checks) and `:104` (the cancel DELETE) also need
   status-awareness, but for logic rather than counting — see T3.2.

3. **Capacity resolution is a stable, reusable rule**: `COALESCE(class_sessions.capacity,
   class_templates.capacity)` for a template+date, where the `class_sessions` row often does
   not exist yet and a session's capacity is **never** copied from its template at creation.
   `null` means unlimited. Resolve it this way in Phase 3; do not reinvent it.

4. **`session_rsvps` has no session-id and never will.** It is keyed
   `(template_id, session_date, user_id)`. One-off sessions (`template_id IS NULL`) can never
   have RSVPs, therefore can never be capacity-limited, therefore can never have a waitlist.
   Nothing in this phase needs to handle them.

5. **Cancelling an RSVP is a hard `DELETE`, not a status flip** (deliberate, bucket 3 in
   `PLAN.md`). Promotion therefore hangs off the DELETE path, and must distinguish a *going*
   student cancelling (frees a spot → promote) from a *waitlisted* student cancelling (frees
   nothing → do not promote). Use `DELETE ... RETURNING status` — one statement, no
   read-then-delete race.

6. **D1 supports `RETURNING`** and single-statement `UPDATE ... WHERE user_id IN (SELECT ...
   ORDER BY ... LIMIT ...)`. Both are load-bearing in T3.1. D1 also has `db.batch()` for
   multi-statement transactions, but T3.1's design does not need it — each mutation is one
   statement by construction.

7. **`created_at` is `CURRENT_TIMESTAMP`** — second resolution, so FIFO ties are possible with
   two RSVPs in the same second. Always order by `created_at, user_id` so ordering is
   deterministic and tests are not flaky.

8. **`sendEmail(env, {to, subject, text})`** already exists at `api/_utils/email.js` (Resend,
   returns a boolean, `RESEND_API_KEY` from env). It does **not** catch a network-level
   `fetch` rejection — T3.3's module must.

9. **`fetchJson` never throws** and page scripts run synchronously at the end of `<body>`
   (Phase 1). No `try/catch` around `fetchJson`, no `DOMContentLoaded` wrapper. A dead
   `try/catch` of exactly this kind was found and removed in Phase 2's review.

---

## Decision points — defaults are spec'd, flipping any is cheap

These were put to Giovanni at the checkpoint and not answered, so each is specified with its
recommended default. Each is isolated to one place so a later change is small.

- **D1 — notify on waitlist join only, not on a class merely filling.** A class reaching
  capacity is normal and not actionable; a person waiting is. To add a `class_full` event
  later: one more case in `buildEvent()` and one call site. (`PLAN.md`'s standing assumption,
  now spec'd.)
- **D2 — raising capacity auto-promotes** (T3.5), reusing the promotion helper, and emails the
  promoted students. To flip to manual promotion: drop T3.5 and add a coach-facing button.
- **D3 — waitlisted students see their queue position** ("Waitlisted — #2 in line"), not the
  total queue length. One extra count in an endpoint that already runs grouped counts.

---

### T3.0 — Migration `0004`, and every counting site in the same commit

**Depends on**: nothing. **Runs as**: Sonnet locally; `[HUMAN GATE]` for production.

The schema change and the four read-site fixes are **one task on purpose**. A migration that
lands without the filters leaves `main` correct only because no waitlisted row exists yet —
the bug is armed and silent. See fact 2 for the exact site list.

`public/migrations/0004_rsvp_status.sql`:

```sql
ALTER TABLE session_rsvps ADD COLUMN status TEXT NOT NULL DEFAULT 'going';
CREATE INDEX idx_session_rsvps_queue
  ON session_rsvps(template_id, session_date, status, created_at);
```

The `DEFAULT 'going'` backfills every existing row correctly by construction — every row that
exists today means "going". Validate `status` in application code, not a CHECK constraint
(SQLite's `ALTER TABLE ADD COLUMN` is constrained, and this codebase has no CHECK constraints
to be consistent with).

**Exit conditions**:
- `wrangler d1 migrations list` shows zero pending locally; production applied only after a
  fresh backup, `[HUMAN GATE]` per T0.3.
- Every row in `session_rsvps` has `status = 'going'` after migration — verified by
  `SELECT COUNT(*) FROM session_rsvps WHERE status <> 'going'` returning 0.
- One test per site in fact 2's table: with a seeded `waitlisted` row present, `attending` is
  unchanged, `full` is unchanged, the next-class panel count is unchanged, and the attendance
  roster does not include the waitlisted student. **Each of these four tests must be shown
  failing before the filter is added, and passing after** — an unfiltered-count test that
  cannot fail is worth nothing (`PLAN.md`, "Rank by damage").
- `grep -rn "FROM session_rsvps" public/functions` — every hit either filters on `status` or
  is annotated with why it must not.

---

### T3.1 — `_utils/waitlist.js`: the promotion helper

**Depends on**: T3.0. **Runs as**: Sonnet.

The single place that decides who gets promoted. Every other task calls this; nobody
reimplements it.

`promoteWaitlist(db, templateId, date)` → resolves effective capacity (fact 3), then promotes
the oldest waitlisted students into whatever free spots exist, **in one statement**, returning
the promoted `user_id`s:

```sql
UPDATE session_rsvps SET status = 'going'
WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'
  AND user_id IN (
    SELECT user_id FROM session_rsvps
    WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'
    ORDER BY created_at, user_id
    LIMIT MAX(0, ? - (SELECT COUNT(*) FROM session_rsvps
                      WHERE template_id = ? AND session_date = ? AND status = 'going'))
  )
RETURNING user_id;
```

The free-spot count is computed *inside* the statement, so two concurrent cancellations cannot
over-promote — the same discipline as T2.3's insert. When effective capacity is `null`
(unlimited), skip the arithmetic and promote every waitlisted row. Returning the promoted ids
is what makes T3.4's notification possible without a second read.

**Exit conditions**:
- Unit-testable promotion order: three waitlisted students, one spot freed → the earliest
  `created_at` is promoted, deterministically, including when two share a `created_at` second.
- Two concurrent `promoteWaitlist` calls with one free spot promote **exactly one** student in
  total — the test T0.5 exists to make possible. This is the phase's most important test.
- Promotes zero when the class is still full. Promotes all when capacity is `null`.
- Never changes a `going` row to `waitlisted` — assert the count of `going` rows is
  monotonically non-decreasing across the helper.

---

### T3.2 — RSVP becomes waitlist-aware

**Depends on**: T3.1. **Runs as**: Sonnet. **Contract change — see exit conditions.**

`api/student/rsvp.js`. The 409 on a full class becomes a waitlist join.

- **`going: true`, capacity available** — unchanged. The atomic insert stays exactly as it is
  (with T3.0's `status = 'going'` filter on its inner count).
- **`going: true`, class full** — instead of the 409, insert `status = 'waitlisted'`, then call
  `promoteWaitlist` immediately. The promote call closes the window where a spot opened between
  the failed going-insert and the waitlist insert; normally it promotes nobody. Respond
  `{ok: true, status: 'waitlisted', position: N}`.
- **Existing row** (`rsvp.js:46`) — must now `SELECT status`, not `SELECT 1`. A `going` student
  re-RSVPing gets `{ok: true, status: 'going'}`; a `waitlisted` student re-RSVPing gets
  `{ok: true, status: 'waitlisted', position: N}` and **no duplicate notification** (T3.4).
- **`going: false`** — `DELETE ... RETURNING status` (fact 5). If the deleted row was `going`,
  call `promoteWaitlist`. If it was `waitlisted`, or no row was deleted, do not.
- Validation order is unchanged: the 400-before-404 order is pinned by an existing test, and
  window/day-of-week checks still apply to creation only, never to cancellation.

**Exit conditions**:
- A full class returns **200 with `status: 'waitlisted'`**, not 409, and writes a waitlisted
  row. The old "This class is full" 409 no longer occurs on a capacity-limited class — update
  the verb table in `plan/codebase-map.md` accordingly.
- A `going` student cancelling promotes the oldest waitlisted student; a `waitlisted` student
  cancelling promotes nobody. Both tested.
- Re-RSVPing is idempotent from both statuses and creates no second row.
- Existing `rsvp.test.mjs` and `rsvp-capacity.test.mjs` pass, amended only where the 409→200
  contract genuinely changed. Do not delete a test to make it pass.

---

### T3.3 — `notifyCoach()`: the notification module

**Depends on**: nothing (parallel with T3.0–T3.2). **Runs as**: Sonnet.

`api/_utils/notify.js`. Two exports, split so the interesting half is testable without network:

- **`buildEvent(type, payload)` — pure.** Returns `{type, subject, text, json}`. Subject is a
  stable bracketed topic: `[CJN][WAITLIST_JOINED] Mon 18:00 Adults — 2026-08-10`. Body is
  key-value lines, one per line, parseable by an inbox-watching automation. No prose.
- **`notifyCoach(env, ctx, event)` — dispatch.** Email via `sendEmail` when
  `COACH_NOTIFY_EMAIL` and `RESEND_API_KEY` are both set; webhook `POST` of `event.json` when
  `COACH_WEBHOOK_URL` is set, with the shared secret in an `X-CJN-Signature` header from
  `COACH_WEBHOOK_SECRET`. Each path is independent: either unset silently no-ops, so the
  feature ships working with neither, one, or both configured.

**Non-negotiable**: this must never break an RSVP. Dispatch through `ctx.waitUntil()` so email
latency never blocks the response, and wrap every dispatch in `try/catch` — `sendEmail` does
not catch a `fetch` rejection (fact 8), and a Resend outage must not turn a successful RSVP
into a 500.

**Exit conditions**:
- `buildEvent` unit-tested for both event types: exact subject topic, and a body that
  round-trips through a naive key-value parse.
- With no env vars set, `notifyCoach` is a no-op that returns normally — asserted, because
  this is the state the entire local test suite runs in. **No test may send real email.**
- An injected failing dispatcher does not change the HTTP response of the calling endpoint.
- Recipient addresses come from env only. `grep -rn "@cjnacademy\|@gmail" public/functions`
  turns up no hardcoded notification recipient.

---

### T3.4 — Wire the two events

**Depends on**: T3.1, T3.2, T3.3. **Runs as**: Sonnet.

- **`waitlist_joined`** → coach. Fires only on a genuinely new waitlist row, never on a
  re-RSVP by someone already waitlisted. Payload: class name, day, time, date, student name,
  resulting queue length.
- **`waitlist_promoted`** → **the student**, plus the coach. Non-optional: a waitlist that
  promotes silently is worse than no waitlist. Driven by the `user_id`s returned from
  `promoteWaitlist`, joined to `users` for name and email. One event per promoted student.

Per D1, there is no `class_full` event.

**Exit conditions**:
- A waitlist join emits exactly one `waitlist_joined`; a repeat RSVP from the same student
  emits none.
- A cancellation that promotes emits one `waitlist_promoted` naming the promoted student, and
  the recipient list includes that student's own address.
- A promotion of two students at once (capacity raised by 2) emits two events, not one.

---

### T3.5 — Auto-promote when capacity is raised

**Depends on**: T3.1, T3.4. **Runs as**: Sonnet. **Per D2.**

Two write points set capacity: `api/coach/templates/[id].js` PATCH and
`api/coach/sessions/[id].js` PATCH. Both call `promoteWaitlist` after a successful write.

**The wrinkle worth planning for**: a *template* capacity change affects every future date that
template expands to, not one date. Bound the work — promote only for dates from today through
the end of the RSVP window (`RSVP_WINDOW_DAYS`) that actually have waitlisted rows, found with
one grouped query rather than a loop over dates. A *session* capacity change affects exactly
one date.

Setting capacity to `null` means unlimited and promotes everyone waiting. **Lowering capacity
below the current going count promotes nobody and demotes nobody** — per fact 1's principle;
the class simply runs over, consistent with T2.3's `spotsRemaining` clamping to 0.

**Exit conditions**:
- Raising a template's capacity by 1 with 3 waitlisted across 2 future dates promotes exactly
  one student *per affected date*, oldest first, and emits one event each.
- Lowering capacity leaves every `going` row untouched — asserted explicitly.
- Past dates are never touched.

---

### T3.6 — Student UI: join, position, leave

**Depends on**: T3.2. **Runs as**: Sonnet.

`api/student/upcoming.js` gains `rsvpStatus` (`null | 'going' | 'waitlisted'`) and
`waitlistPosition` (`null` unless waitlisted) per row.

**Do not silently redefine `going`.** It currently means "I have a row" and the page reads it
directly; from now on it means `status === 'going'` only, and the UI branches on `rsvpStatus`.
Getting this wrong shows waitlisted students a confirmed booking.

`public/student/upcoming.html`: a full class shows **"Join waitlist"** instead of a disabled
"Full"; a waitlisted row shows **"Waitlisted — #2 in line"** (per D3) with a way to leave the
waitlist, which reuses the same `going: false` call.

**Exit conditions**:
- Three states render distinctly on one page: not booked / going / waitlisted-with-position.
- Leaving the waitlist from the UI removes the row and does not promote anyone.
- `styles.css?v=` and `app.js?v=` bumped on **every** page that references them if either
  changes — `PLAN.md` rule 6, checked with `grep -rn "app\.js?v=" public`.

---

### T3.7 — Coach visibility

**Depends on**: T3.0, T3.6. **Runs as**: Sonnet.

Without this the coach gets an email about a waitlist they cannot see. Deliberately small:

- `api/coach/next-class.js` + the dashboard panel: a waitlist count beside the headcount,
  shown only when non-zero.
- `api/coach/sessions/[id].js` + `coach/session.html`: the waitlisted students listed under
  the roster, in queue order, visually separate from the attendance list so they cannot be
  confused with people to mark present.

**Exit conditions**:
- The panel's waitlist count matches a direct `SELECT COUNT(*) ... WHERE status = 'waitlisted'`.
- Waitlisted students appear in `created_at` order and are **not** in the attendance roster —
  the T3.0 pre-fill test still passes.

---

### T3.8 — Configure notification env vars

**Depends on**: T3.3. **Runs as**: `[HUMAN GATE]` — Giovanni, in the Cloudflare dashboard.

`COACH_NOTIFY_EMAIL` (required for email), `COACH_WEBHOOK_URL` and `COACH_WEBHOOK_SECRET`
(both optional). Add the same names to local `.dev.vars` **left empty**, so the local suite
exercises the no-op path.

Worth restating from the original spec: Cloudflare env vars are readable only by the Functions
themselves. They configure *where the site sends*; they are not a channel anything subscribes
to. Giovanni's WhatsApp automation is downstream and out of scope — this phase's contract ends
at "emits a well-formed event".

**Exit conditions**: presenting the exact values to set and waiting for confirmation; then one
real end-to-end waitlist join on production producing one email with the expected subject.

---

### T3.9 — Docs, map, and completion report

**Depends on**: all. **Runs as**: Sonnet.

Update `public/docs/coach-student-system.md` (waitlist behaviour in usage terms) and
`coach-student-system-technical.md` (the `status` column, the promotion statement, the
notification contract and its env vars). Update `plan/codebase-map.md`: the verb table's
`rsvp.js` row (409 → 200 waitlisted), the new `_utils/waitlist.js` and `_utils/notify.js`, the
migration list, the asset versions, and a new non-obvious-behaviours entry for the
`status = 'going'` filter requirement. Then `reports/phase-3-completion.md` with actual command
output per exit condition, and `reports/phase-3-checkpoint-packet.md` (~150 lines) for the
Phase 3 → 4 checkpoint.

---

## Carried into Phase 4

Phase 4 (payments) adds an overdue flag to the attendance roster. It will read the same roster
query T3.0 filters and T3.7 extends — an overdue *waitlisted* student is a state that will
exist, and Phase 4 should decide deliberately whether overdue status affects promotion.
`PLAN.md`'s standing assumption for Phase 4 is "flag only, no enforcement", which would mean
promotion ignores it.

# Phase 2 — Capacity, headcount, and coach quality-of-life

**Status**: Not started. Phase 1 is merged to `main` and live-verified.
**Amended**: 2026-08-06 at the Phase 1 → 2 checkpoint (Opus), against the code as it stands
on `main` at `2dd4d2d`. Every "amended" note below marks something the original spec got
wrong or left open; they exist so the executing session does not re-derive them.

**Goal**: Giovanni's stated #1 — a live count of who's coming to the next class — plus the
admin-time reductions that share the same code.

**Branch**: `phase-2-capacity`. **Reviewer**: a fresh Sonnet session that did not write the
code (Phase 2 is *not* on `/code-review ultra`'s reserved list — see `PLAN.md`'s review policy).

---

## Facts established at the checkpoint — do not re-derive

Read these before starting; they are the difference between this phase taking one pass and three.

1. **Migrations live in `public/migrations/`** — `0001_initial.sql`, `0002_session_rsvps.sql`.
   Next is `0003_class_capacity.sql`, in that directory.
2. **`fetchJson` (in `public/app.js`) no longer throws.** Since Phase 1's fix pass it returns
   `{ response: null, data: { ok: false, error: 'Network error. Please try again.' } }` on a
   network failure or non-JSON body. All new call sites branch on `data.ok` and use
   **`response?.ok`**, never `response.ok`. Do not wrap it in `try/catch` "for safety".
3. **Page scripts run synchronously at the end of `<body>`, not on `DOMContentLoaded`.**
   Phase 1 removed the hand-copied `DOMContentLoaded` wrapper from seven files. Match that.
4. **HTTP verbs that exist today** (grepped, complete):
   `templates.js` GET/POST · `templates/[id].js` **PATCH only, and it hard-rejects any body
   without a boolean `active`** · `sessions.js` GET/POST · `sessions/[id].js` **GET only** ·
   `mark-attendance.js` POST · `students.js` GET/POST · `students/[id].js` PATCH ·
   `student/upcoming.js` GET · `student/rsvp.js` POST.
5. **`sessions/[id].js` cannot currently distinguish a never-saved session from one saved with
   everyone absent** — it returns `status: r.status || 'absent'`, collapsing NULL into
   `'absent'`. T2.5's central constraint is therefore **not implementable client-side**; it
   needs the API change specified there. This is the most important finding of the checkpoint.
6. **`_utils/dates.js` has no time-of-day helper.** `todayIso()` returns a SAST *date*.
   T2.4's "a class that started earlier today is not next" needs SAST *time*; T2.4 adds it.
7. **Only `rsvp.js` guards against a literal JSON `null` body.** The other ten handlers throw
   an uncaught `TypeError` → bare 500. Phase 2 opens four of them; T2.0 fixes those four.

---

### T2.0 — `parseJsonBody` helper, adopted in the files this phase opens

**Depends on**: nothing. **Runs as**: Sonnet. **New task, added at the checkpoint.**

`TODO.md`'s "Logged, not fixed" list says a shared body-parse helper is worth writing "next
time any of these files is touched, rather than patching all 11 in one pass". Phase 2 touches
four of them and adds new parse branches to two — writing those in the old shape and
retrofitting later costs more than doing it first.

Add `parseJsonBody(context)` to `public/functions/api/_utils/` (its own file, or alongside the
existing helpers — one place either way) doing what `rsvp.js:6-16` does inline today: parse,
catch, and reject non-object values including a literal `null`, returning a discriminated
result the caller turns into the existing `{ ok:false, error:'Malformed request' }` 400.

Adopt it in **exactly these four**: `coach/templates.js`, `coach/templates/[id].js`,
`coach/sessions.js`, `coach/sessions/[id].js` (once T2.2 gives it a PATCH), plus refactor
`student/rsvp.js` onto it. **Do not** touch the other six — that is bucket 2, and expanding
this branch is the failure mode `PLAN.md` warns about.

**Exit condition**:
- A request with a literal JSON `null` body returns **400 with the existing error shape**, not
  a 500, on every adopted route. Tested per route.
- `rsvp.js`'s existing null-body test still passes unchanged after the refactor.
- No behaviour change to any valid request — existing suite green.

---

### T2.1 — Add capacity to the schema

**Depends on**: T2.0 (ordering only; no code dependency).
**Runs as**: Sonnet locally; `[HUMAN GATE]` for the production migration.

`public/migrations/0003_class_capacity.sql`:
- `class_templates.capacity` — INTEGER, nullable. NULL means "no limit".
- `class_sessions.capacity` — INTEGER, nullable. NULL means "inherit from the template".

Nullable in both cases so existing rows remain valid and unlimited-capacity stays expressible.
**Every existing row stays NULL**, which is what makes T2.3's enforcement safe to ship to a live
site: nothing changes for any student until Giovanni deliberately sets a cap.

**Amended — the backup gate.** This is the first production migration since Phase 0, so T0.3's
procedure is not optional here: a fresh production export must exist *before* the `--remote`
apply in T2.7, and the seeded/restored-DB checks below happen locally first.

**Exit condition**:
- Migration applies cleanly to a **freshly seeded local DB** and to a local DB restored from a
  T0.3 production export (proving it works against real data shapes, not just seed data).
- `wrangler d1 migrations list` shows it pending before, applied after.
- Existing tests still pass.
- Production application is a separate, human-gated step in T2.7, preceded by a fresh backup.

---

### T2.2 — Capacity management API and UI

**Depends on**: T2.0, T2.1. **Runs as**: Sonnet.

**Resolution rule, stated once and reused everywhere**: a class's effective capacity is
`COALESCE(class_sessions.capacity, class_templates.capacity)` for that template+date, where the
`class_sessions` row is joined by `template_id + session_date` and **may not exist yet** (coaches
create sessions on the day). No session row → the template's capacity. `NULL` → unlimited.

API changes:
- `coach/templates.js` **POST**: accept optional `capacity`.
- `coach/templates/[id].js` **PATCH**: currently rejects any body without a boolean `active`
  (`templates/[id].js:12`). Restructure to a **partial update** — apply `active` and/or
  `capacity` when present, reject a body containing neither. Keep the existing 404-on-no-rows
  behaviour.
- `coach/templates.js` **GET**: return `capacity` (currently not selected).
- `coach/sessions/[id].js`: **new `onRequestPatch`** for the per-session override. GET also
  returns `capacity` (the session's own) and `effectiveCapacity` (resolved per the rule above).
- `coach/sessions.js` GET/POST: return `capacity` on both the `templatesForDay` and `sessions`
  arrays. A session created from a template **does not copy** the template's capacity into its
  own column — it stays NULL so later template changes still flow through. Copying would break
  the inheritance the exit condition tests.

**Amended — where the session override lives.** The original spec put it on
`coach/attendance.html` "when creating a session", but sessions are created there by a bare
`Create session` button with no form (`attendance.html:127`), so there is nowhere to put a field
without inventing one. Put the override on **`coach/session.html`** instead — the session's own
page, where the coach already is when they care — as a small capacity input that PATCHes.
`coach/templates.html` gets the template-level field on the add form and the row.

Validation, **server-side in every case** (the HTML `type="number"` is not the guard):
- Accept: a positive integer, or empty/absent/`null` meaning unlimited.
- Reject with 400 and a clear message: non-numeric, negative, zero, and non-integer values.
- Empty string from a form field means **clear to unlimited**, not zero.

**Exit condition**:
- A capacity set on a template persists, displays on reload, and can be cleared back to
  unlimited.
- A session created from a template with capacity 20 and no override reports effective capacity
  20; changing the template to 25 afterwards makes that session report 25 (inheritance is live,
  not copied).
- A session with an override of 12 reports 12, and the template still reports 20.
- Non-numeric, negative, zero, and `12.5` are rejected server-side with a clear error — proven
  by a direct API call, not through the form.
- A PATCH body with neither `active` nor `capacity` is rejected; a PATCH with only `capacity`
  succeeds without disturbing `active`, and vice versa.
- Tests cover inheritance, override, clearing, and the validation table.

---

### T2.3 — Enforce capacity on student RSVP

**Depends on**: T2.2. **Runs as**: Sonnet. **New task — decided by Giovanni at the checkpoint.**

Capacity that does not stop anything is a number with no meaning, and Phase 3 would then have to
retrofit enforcement *and* build the waitlist in one pass. So Phase 2 enforces, and Phase 3 turns
the rejection into a waitlist offer.

`student/rsvp.js`, in the `going: true` branch only:
- Resolve effective capacity per T2.2's rule. NULL → unchanged behaviour, no counting.
- **A student who already has a row is never rejected** — a full class must not break the
  idempotent re-RSVP the current `ON CONFLICT ... DO NOTHING` provides. Check for the existing
  row first and return `{ ok: true }`.
- Otherwise insert **atomically**, so two students racing for the last spot cannot both win:
  ```sql
  INSERT INTO session_rsvps (template_id, session_date, user_id)
  SELECT ?, ?, ?
  WHERE (SELECT COUNT(*) FROM session_rsvps WHERE template_id = ? AND session_date = ?) < ?
  ```
  then branch on `meta.changes === 0` to return the full-class error. Do **not** implement this
  as read-count-then-insert; a pre-check is fine for the friendly message but must not be the
  thing that decides.
- Full-class response: **409** with `{ ok: false, error: 'This class is full' }`. A new status
  code in a codebase that only uses 400/404 — deliberate, so Phase 3's waitlist has a distinct
  signal to hook. Document it in the technical reference.
- Cancellation (`going: false`) is untouched. So is the past-date/window/day-of-week ordering —
  `rsvp.js`'s deliberate 400-before-404 order is pinned by an existing test.

`student/upcoming.js` + `student/upcoming.html`: each row gains `capacity`, `attending` (the
count), and `full`. **Name the count `attending`, not `going`** — `going` already means "am *I*
going" on that same row, and shadowing it is a bug waiting to happen. Count all templates in one
grouped query, not one per row. The UI shows remaining spots and disables the RSVP control with a
"Full" label when `full && !going`; an already-going student always keeps a working cancel.

**Exit condition**:
- With capacity 2 and two RSVPs, a third student's RSVP returns 409 and writes no row (verified
  by direct query).
- The two who are in can still cancel, and re-RSVP if a spot reopens.
- A student already RSVP'd to a now-full class re-POSTing `going: true` gets `ok: true`, not 409.
- A NULL-capacity class accepts unlimited RSVPs — no behaviour change from today.
- Concurrency: two simultaneous requests for one remaining spot produce exactly one row.
- The student page shows "Full" and no RSVP control for a full class the student is not in.

---

### T2.4 — Next-class panel on the coach dashboard

**Depends on**: T2.2. **This is the stated headline goal.** **Runs as**: Sonnet.

`/coach/dashboard.html` gains a panel showing the next upcoming class: name, date, start time,
confirmed RSVP count, capacity, and spots remaining. The page currently has **no script of its
own** (Phase 1 emptied it) — this adds the first one.

New `GET /api/coach/next-class` returning
`{ ok: true, nextClass: null | { templateId, name, date, startTime, endTime, attending, capacity, spotsRemaining } }`.
`capacity: null` → `spotsRemaining: null`, and the panel renders "12 going" rather than
"12 / null".

**"Next" is defined as**: the earliest `(date, start_time)` among active templates expanded over
the next `RSVP_WINDOW_DAYS` days from `todayIso()`, where for **today** only those with
`start_time >= ` the current SAST time survive. A class starting at this exact minute still
counts as next (it is the one the coach wants a headcount for); one that started a minute ago does
not. That is a deliberate choice — do not "fix" it to `>` without raising it.

**Amended — the missing time helper.** `_utils/dates.js` has no time-of-day function. Add
`sastNowParts(now = new Date())` returning `{ date, time }` with `time` as `'HH:MM'`, following
`todayIso`'s injectable-`now` pattern so the 00:30 SAST scenario below is testable without
touching the system clock. `todayIso` may delegate to it **only if** the existing T0.6b
regression tests pass unchanged — that bug is not worth re-opening for tidiness.

**Amended — share the expansion, don't write a third copy.** `student/upcoming.js:21-36` already
expands active templates across a date window and sorts by `date + startTime`; this task needs
the same thing. Extract it to `_utils/` (e.g. `expandTemplates(templates, dates)`) and have both
callers use it. **Write an integration test pinning `/api/student/upcoming`'s window and ordering
*before* the refactor**, so the refactor is provably behaviour-preserving rather than hopefully so.

**Amended — resolves the third "today"** (deferred from Phase 1, `TODO.md`):
`coach/attendance.html:76-81`'s `todayLocalIso()` computes today from the **browser's** timezone.
Replace it with a shared `sastTodayIso()` in `public/app.js` mirroring `_utils/dates.js`'s fixed
+2 offset, and delete `todayLocalIso`. **Decision, already taken — do not re-litigate**: having
the server hand the client "today" was considered and rejected, because it puts a network
round-trip in front of populating a date input and makes the page fail worse offline. This accepts
the same duplication trade-off as Phase 1's rejected finding #4 (`dateFromQuery` vs `isValidDate`)
for the same reason: no build step, so a browser script cannot import a server ES module. Both
copies carry a comment naming the other, and `test/unit/shared-frontend.test.mjs` asserts the
offset appears in both files and that `todayLocalIso` is gone.

**Asset versioning** (`PLAN.md` rule 6): editing `public/app.js` means bumping `app.js?v=1` to
`?v=2` on **all 12 pages**. `grep -rn "app\.js?v=" public` returning nothing at `v=1` is the check.

**Exit condition**:
- With seeded data, the panel names the correct next class — verified across at least three
  scenarios: mid-week, a class later today, and the last class of the week rolling to next week.
- The RSVP count matches a direct `SELECT COUNT(*)` against `session_rsvps` for that
  template+date.
- Unlimited-capacity classes display sensibly ("12 going"), not "12 / null".
- No class scheduled in the window renders a clear empty state, not a blank panel or an error.
- **Timezone check**: with `sastNowParts` given a simulated 00:30 SAST, the panel does not show a
  class that already finished yesterday. This is the T0.6b regression at feature level.
- **Timezone check 2**: with the browser's timezone set to something other than SAST,
  `coach/attendance.html` still opens on the SAST date.
- `/api/student/upcoming` behaves identically before and after the shared-helper refactor.

---

### T2.5 — Pre-fill attendance from RSVPs

**Depends on**: T2.1 (nothing else). **Runs as**: Sonnet.

`/coach/session.html` currently defaults every student to *absent*. Change the default so students
who RSVP'd for that class+date are pre-selected **present**, turning roster marking from twenty
clicks into correcting two exceptions.

**Amended — this needs an API change; it cannot be done in the page.**
`sessions/[id].js:45` returns `status: r.status || 'absent'`, which collapses "no attendance row
exists" and "a row exists saying absent" into the same value. The client therefore has no way to
tell a never-saved session from a saved all-absent one, and a client-only implementation will
silently fail the regression that matters most below. Add to the GET response:

```js
attendanceSaved: <SELECT COUNT(*) FROM attendance WHERE session_id = ?> > 0
```

Keep `status`'s existing coalesce so nothing else changes. `mark-attendance.js` writes a row for
**every** student on the roster, not only those present (deliberate — see `PLAN.md`'s bucket-3
list), which is what makes a non-zero count a reliable "this session has been saved" signal.

Client rule: pre-fill from `going` **only** when `attendanceSaved === false` and
`session.templateId` is set; otherwise render `status` exactly as returned.

Constraints, all load-bearing:
- Pre-fill applies **only** to a session that has never been saved. Reopening a saved session
  must show exactly what was last saved — the amend-after-the-fact guarantee must not regress.
- One-off sessions (`template_id IS NULL`) have no RSVPs; they keep defaulting to absent.
- Pre-fill is a UI default only. It must not write attendance rows until the coach saves.

**Exit condition**:
- A never-saved session created from a template shows RSVP'd students present, everyone else absent.
- Saving, then changing a student to absent, then saving, then reopening shows that student
  **absent** — saved state beats RSVP pre-fill. This is the regression that matters most; test it
  explicitly, and note it is exactly the case the old API shape could not express.
- Opening and *not* saving writes zero attendance rows (verify by direct query).
- A one-off session defaults everyone to absent.
- Tests cover all four cases.

---

### T2.6 — Roster search and filter

**Depends on**: T2.5 (ordering only). **Runs as**: Sonnet.

Client-side search on `/coach/students.html` filtering by name and email as you type, plus a
status filter (active / inactive / all). Client-side is sufficient and correct at gym scale — the
roster is already fully loaded — and avoids a new endpoint. Revisit only past ~500 students.

**Exit condition**:
- Typing filters the visible rows to matching name or email, case-insensitively.
- Clearing the box restores every row.
- The status filter composes with the search rather than replacing it.
- No matches renders a clear empty state.
- Works on mobile viewport inside the existing `.scroll-x` wrapper.

---

### T2.7 — Review, production rollout, and documentation

**Depends on**: T2.6. **Runs as**: `[HUMAN GATE]` throughout.

1. **Independent review first**: a fresh Sonnet session that did not write this code reviews the
   branch diff against `PLAN.md`'s four-bucket rule and this file's exit conditions. Triage
   before fixing anything. Phase 2 is **not** on `/code-review ultra`'s reserved list — ask before
   spending it.
2. Fresh production backup (T0.3 procedure) — the gate for the first `--remote` migration since
   Phase 0.
3. Apply `0003` to production via `wrangler d1 migrations apply --remote`.
4. Merge the branch, deploy, verify live.
5. Update `coach-student-system.md` + `-technical.md`: the capacity columns, the resolution rule,
   the new 409, `sastNowParts`/`sastTodayIso`, and the coach walkthrough for setting a capacity.
6. Update `plan/codebase-map.md` with the new endpoints and any structural change.

**Exit condition**:
- `wrangler d1 migrations list --remote` shows zero pending.
- The live coach dashboard shows a correct next-class panel with real data.
- Setting a real capacity on a real weekly class persists and displays.
- Existing real attendance records are unaffected — spot-check a historical session against the
  pre-migration backup.
- Asset versions bumped on every page that references a changed asset.

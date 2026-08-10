# feat/schedule-ux — date legibility, covers formatting, schedule layout

**Status**: Specified 2026-08-10, at Giovanni's request between the Phase 4→5 checkpoint
and Phase 5's T5.0. Not a numbered phase — this is UI/display work plus one form move and
one new read-only endpoint. **No schema change, no migration, no new tables.**
Branch: `feat/schedule-ux`.

The one request in this batch that *would* need a schema change — students booking
one-off sessions — is split out to `plan/phase-5.5-bookable-sessions.md`. See "Explicitly
out of scope" below.

---

## Facts confirmed by Giovanni, 2026-08-10

1. **Date format is `10 Aug 2026 (Tue)`** — everywhere a class date is displayed.
2. **The attendance date picker keeps its native `<input type="date">`**, with a live
   formatted label beside it. A native date input's display format is controlled by the
   browser/OS locale and exposes no CSS or JS hook; the alternative was a hand-rolled
   datepicker, which was declined.
3. **`coach/session.html`'s header is the only additional date site to change.** The
   payment "Date" columns and `coach/requests.html`'s "Requested" column were offered and
   declined.
4. **Extra one-off classes should be fully bookable by students** — deferred, see below.

---

## Decisions

- **D1 — One shared browser formatter, in `public/app.js`.** `formatClassDate(iso)` →
  `'10 Aug 2026 (Tue)'`. It deliberately duplicates the server's `dayLabelFor()`
  (`_utils/dates.js:29`) rather than importing it: `_utils/dates.js` is an ES module and
  `app.js` is a plain `<script>` with no bundler, and a build step is banned by `PLAN.md`'s
  inherited conventions. This is the same duplication `sastTodayIso()` already carries for
  the same reason, and the Phase 1 review already rejected the sharing proposal
  (`TODO.md`, "Rejected (review finding #4)"). Do not re-litigate it; do add a comment
  pointing at its server twin, as `sastTodayIso()` does.
- **D2 — The formatter must never construct a local-time `Date` from a date-only string.**
  `new Date('2026-08-10')` parses as UTC midnight, so any browser west of UTC renders it
  as the 9th — a whole-day-off bug on a page whose entire purpose is showing the right day.
  Mirror `dayLabelFor()`'s existing approach exactly and pin it with a test that would fail
  under a negative-offset timezone.
- **D3 — `formatCoversRange(startIso, endIso)` is a separate helper with an explicit
  fallback.** If `start` is the 1st and `end` is the last day of the *same* month and
  year → `'August 2026'`. Otherwise → the current raw `start – end` display, unchanged.
  The covers range is free-form: `coach/payments.html:133` only *defaults* it to the
  calendar month, so a coach can enter any range, and a formatter that assumed otherwise
  would silently mislabel a part-month payment.
- **D4 — The one-off session form moves to `coach/templates.html`**, not to a new
  `coach/schedule.html` (no such page exists; "Schedule" is the nav label for
  `templates.html`).
- **D5 — The next-7-days table is read-only and reuses existing machinery.**
  `expandTemplates()` (`_utils/schedule.js`) for the expansion, and the same grouped
  `status='going'` count shape as `student/upcoming.js` for spots-left. One grouped query,
  not a per-date loop.

## Hard constraints

- **Every count against `session_rsvps` filters `status = 'going'`.** See
  `plan/codebase-map.md` — an unfiltered count lets a waitlisted row consume a capacity
  slot or inflate a headcount. This batch adds a new counting site (D5), which is exactly
  where that bug would reappear.
- **`_utils/waitlist.js` and `api/student/rsvp.js` are not edited.** Nothing here changes
  a write path. If a task appears to need one, it belongs in Phase 5.5, not this branch.
- **Asset versions must be bumped on every referencing page** (`PLAN.md` rule 6) —
  `app.js` gains two functions and `styles.css` gains the two-column layout. Verify with
  `grep -rn "app\.js?v=" public`; the count must equal the page count.

---

## Tasks

### T-UX.1 — The two formatters in `app.js`
**Depends on**: nothing.

`formatClassDate(iso)` (D1, D2) and `formatCoversRange(startIso, endIso)` (D3).

**Exit**: unit tests covering — a Sunday and a Monday; a leap-year 29 Feb; a full
calendar month rendering as `'August 2026'`; a February range (28/29-day month boundary)
rendering as `'February 2026'`; a part-month range falling back to the raw display; and
the D2 timezone test. Written failing-first where the behaviour is new.

### T-UX.2 — Apply `formatClassDate` to the five class-date sites
**Depends on**: T-UX.1.

- `coach/dashboard.html:79` — `#nextClassPanel`'s `p.muted`.
- `student/dashboard.html:114` — attendance table Date column.
- `student/upcoming.html:84` — Date column.
- `coach/session.html:99` — the session header (fact 3).
- `coach/attendance.html` — a live label beside `#dateInput` (fact 2), updated on
  `change`, **and** the `#suggestedSessions` section heading becomes "Scheduled classes
  for 10 Aug 2026 (Tue)".

**Note on the original request**: `#suggestedSessions` renders no date at all today — its
`p.muted` is only the empty-state message. The heading is where the date belongs.

Also replace `coach/templates.html:88`'s hand-rolled `DAY_NAMES` array with the shared
helper's day names, so there is one list of weekday names in the browser, not two.

**Exit**: `grep -rn 'DAY_NAMES' public` returns only the `app.js` definition; each of the
five sites renders the new format; the shared-frontend page-list test still covers every
page.

### T-UX.3 — Covers columns show the month
**Depends on**: T-UX.1.

Two sites, both currently `${p.coversStart} – ${p.coversEnd}`:
`coach/payments.html:179` (`#ledgerTable`) and `student/dashboard.html:81`
(`#paymentsPanel`).

**Exit**: a payment covering 2026-08-01→2026-08-31 shows `August 2026` on both pages; a
payment covering 2026-08-01→2026-08-15 still shows the raw range on both.

### T-UX.4 — Move the one-off session form to `coach/templates.html`, with a date
**Depends on**: nothing.

Move the `#addOneOffForm` section out of `coach/attendance.html` and into
`coach/templates.html`, laid out as a two-column flex beside "Add a recurring weekly
class" (recurring on the left), **stacking to one column on narrow screens** — every other
page here is mobile-usable and this must stay so.

Add a required date field. The form currently has none: it borrows the attendance page's
picker (`date: dateInput.value`, `coach/attendance.html:158`), which is exactly why an
extra class can only ever be created for the day being viewed.

**Verify before building**: check whether `POST /api/coach/sessions` already validates the
incoming date with `isValidDate` and already accepts arbitrary future dates. If it does,
this is a pure frontend task. Do not assume — read the handler.

**Known regression, accepted**: `coach/attendance.html` loses its inline "add an extra
session for this date" affordance. T-UX.5's table is on that page and links to the
schedule page, which covers the workflow.

**Exit**: an extra session created for a date two weeks out appears under that date on
`coach/attendance.html`; the layout is single-column at 480px wide.

### T-UX.5 — Next-7-days table on `coach/attendance.html`
**Depends on**: nothing (T-UX.2 for the date format if both land).

A read-only table above the date picker: date, class, time, spots left. New
`GET /api/coach/upcoming` (or an extension of `next-class.js` — the executor picks, and
records which in `plan/codebase-map.md`), reusing `expandTemplates()` and
`student/upcoming.js`'s grouped-count shape (D5).

Include one-off `class_sessions` rows in the listing so a future extra class created in
T-UX.4 is visible here. They show `—` for spots, not `0`: a one-off cannot be
capacity-limited or RSVP'd today (see "Explicitly out of scope"), and `0` would read as
"full".

**Exit**: a test asserting the endpoint's query count does not scale with the number of
days or classes; a waitlisted RSVP does not reduce the spots-left figure (the
`status='going'` constraint above); a one-off session appears with `—`.

### T-UX.6 — Versions, docs, review, merge, deploy
**Depends on**: all of the above.

Bump `styles.css?v=` and `app.js?v=` on **every** referencing page. Update
`plan/codebase-map.md` (verb table for the new endpoint, asset versions, the page
inventory rows for `attendance.html` and `templates.html`) and
`public/docs/coach-student-system*.md`.

Fresh Sonnet reviewer, not the session that wrote it:
`git diff main...feat/schedule-ux -- . ':(exclude)reports/'`. Then review → fix → merge →
deploy. **No migration in this batch**, so nothing touches production data.

**Commit your work.** `git status` clean is an exit condition of every task above.

---

## Explicitly out of scope — moved to Phase 5.5

**Students booking one-off sessions.** Giovanni confirmed on 2026-08-10 that extra classes
should be fully bookable, with capacity and waitlist like any other class. That is not a
UI change: `session_rsvps` is keyed `(template_id, session_date, user_id)` — deliberately,
because students RSVP *before* a `class_sessions` row exists — so a one-off
(`template_id IS NULL`) can never carry an RSVP and can never be capacity-limited.

Delivering it means an alternative key on `session_rsvps` and edits to the most delicate
code in the repo: `rsvp.js`'s atomic capacity insert, `promoteWaitlist()`'s single-query
promotion guarantee, and every `status='going'` count — against a table holding live RSVP
data. Phase 3-sized, and it belongs on its own branch behind its own review.

Until it ships, an extra class is coach-visible only (T-UX.5) and students are told about
it out of band.

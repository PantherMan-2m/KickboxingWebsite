# Phase 2 — Capacity, headcount, and coach quality-of-life

**Status**: Not started. Depends on Phase 1 merging to `main` first.

**Goal**: Giovanni's stated #1 — a live count of who's coming to the next class — plus the
admin-time reductions that share the same code.

---

### T2.1 — Add capacity to the schema

**Depends on**: T1.3.
**Runs as**: Sonnet locally; `[HUMAN GATE]` for the production migration.

Migration `0003_class_capacity.sql`:
- `class_templates.capacity` — INTEGER, nullable. NULL means "no limit".
- `class_sessions.capacity` — INTEGER, nullable. NULL means "inherit from the template".

Nullable in both cases so existing rows remain valid and unlimited-capacity stays expressible.

**Exit condition**:
- Migration applies cleanly to a **freshly seeded local DB** and to a local DB restored from the
  T0.3 production export (proving it works against real data shapes, not just seed data).
- `wrangler d1 migrations list` shows it pending before, applied after.
- Existing tests still pass.
- Production application is a separate, human-gated step, preceded by a fresh backup per T0.3.

---

### T2.2 — Capacity management UI

**Depends on**: T2.1.
**Runs as**: Sonnet.

- `/coach/templates.html` — capacity field when creating/editing a weekly class. Blank =
  unlimited.
- `/coach/attendance.html` — optional capacity override when creating a session. Blank =
  inherit from template.
- Corresponding API changes to the templates and sessions endpoints.

**Exit condition**:
- A capacity set on a template persists, displays on reload, and can be cleared back to
  unlimited.
- A session created from a template with capacity 20 and no override reports capacity 20.
- A session created with an override of 12 reports 12, and the template still reports 20.
- Non-numeric, negative, and zero capacities are rejected with a clear error — **server-side**,
  not just by the HTML input type.
- Tests cover inheritance and override resolution.

---

### T2.3 — Next-class panel on the coach dashboard

**Depends on**: T2.2. **This is the stated headline goal.**
**Runs as**: Sonnet.

`/coach/dashboard.html` gains a panel showing the next upcoming class: name, date, start time,
confirmed RSVP count, capacity, and spots remaining.

"Next" means the earliest future occurrence from the active weekly templates, using the
timezone-correct `todayIso()` fixed in T0.6b. A class that started earlier today is not "next".

**Also resolves** (deferred here from Phase 1, `TODO.md`): `coach/attendance.html`'s
`todayLocalIso()` uses the browser's local timezone, a third notion of "today" alongside the
server's SAST-fixed `todayIso()`. This panel builds directly on "today" for the coach
dashboard — reconcile the two before or as part of this task.

**Exit condition**:
- With seeded data, the panel names the correct next class — verified across at least three
  scenarios: mid-week, a class later today, and the last class of the week rolling to next week.
- The RSVP count matches a direct `SELECT COUNT(*)` against `session_rsvps` for that
  template+date.
- Unlimited-capacity classes display sensibly (e.g. "12 going") rather than "12 / null".
- No class scheduled in the next 7 days renders a clear empty state, not a blank panel or an
  error.
- **Timezone check**: with the clock simulated at 00:30 SAST, the panel does not show a class
  that already finished yesterday. This is the T0.6b regression, verified at the feature level.

---

### T2.4 — Pre-fill attendance from RSVPs

**Depends on**: T2.3.
**Runs as**: Sonnet.

`/coach/session.html` currently defaults every student to *absent*. Change the default so
students who RSVP'd for that class+date are pre-selected **present**, turning roster marking
from twenty clicks into correcting two exceptions.

Constraints, all load-bearing:
- Pre-fill applies **only** to a session that has never been saved. Reopening a saved session
  must show exactly what was last saved — the existing amend-after-the-fact guarantee must not
  regress.
- One-off sessions (`template_id IS NULL`) have no RSVPs; they keep defaulting to absent.
- Pre-fill is a UI default only. It must not write attendance rows until the coach saves.

**Exit condition**:
- A never-saved session created from a template shows RSVP'd students as present and everyone
  else as absent.
- Saving, then changing a student to absent, then saving, then reopening shows that student
  **absent** — the saved state wins over the RSVP pre-fill. This is the regression that matters
  most; test it explicitly.
- Opening and *not* saving writes zero attendance rows (verify by direct query).
- A one-off session defaults everyone to absent.
- Tests cover all four cases.

---

### T2.5 — Roster search and filter

**Depends on**: T2.4.
**Runs as**: Sonnet.

Client-side search on `/coach/students.html` filtering by name and email as you type, plus a
status filter (active / inactive / all). Client-side is sufficient and correct at gym scale —
the roster is already fully loaded — and avoids a new endpoint. Revisit only past ~500 students.

**Exit condition**:
- Typing filters the visible rows to matching name or email, case-insensitively.
- Clearing the box restores every row.
- The status filter composes with the search rather than replacing it.
- No matches renders a clear empty state.
- Works on mobile viewport inside the existing `.scroll-x` wrapper.

---

### T2.6 — Phase 2 production rollout and documentation

**Depends on**: T2.5.
**Runs as**: `[HUMAN GATE]` throughout.

1. Fresh production backup (T0.3 procedure).
2. Apply migration `0003` to production via `wrangler d1 migrations apply --remote`.
3. Merge the branch, deploy, verify live.
4. Update the technical reference doc — schema, endpoints, coach walkthrough.

**Exit condition**:
- `wrangler d1 migrations list --remote` shows zero pending.
- The live coach dashboard shows a correct next-class panel with real data.
- Setting a real capacity on a real weekly class persists and displays.
- Existing real attendance records are unaffected — spot-check a historical session against the
  pre-migration backup.

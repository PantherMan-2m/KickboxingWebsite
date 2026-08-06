# Phase 1 Completion Report — Shared Frontend and Navigation

**Status**: T1.1 → T1.2 → T1.3 done, in order, each demonstrated before moving to the
next. Branch `phase-1-shared-frontend`. Remaining: `/code-review ultra` (Giovanni
triggers it, not this session), the merge itself (`[HUMAN GATE]`), and post-deploy live
verification after that merge deploys.

**Branch base**: created from `main` at `2b10dad` (Phase 0's final commit). First commit
on the branch (`3755a01`) is the T1.1 spec amendment to `PLAN.md` itself, made at the
Phase 0→1 checkpoint before any code was touched — recorded here since it explains why
T1.1's implementation differs from the phase's original one-line task description.

---

## T1.1 — Extract shared frontend code into `app.js`

**Exit conditions and evidence:**

### All 12 pages load with zero console errors, evidenced per page
Verified with `npm run dev` running locally and the browser tool's console-message
capture, navigate-then-check on each page. All 12 returned **"No console logs."**
immediately after navigation:

| Page | Console | Notes |
|---|---|---|
| `index.html` | clean | checked before and after all interaction tests below |
| `login.html` | clean | `#year` → `"2026"`; real logins performed as both coach and student, both succeeded |
| `change-password.html` | clean | mismatched-password client-side validation exercised |
| `request-account.html` | clean | real submission exercised (`fetchJson` path) |
| `coach/dashboard.html` | clean | this page's inline `<script>` is now empty — everything it had was nav/logout/year |
| `coach/attendance.html` | clean | **see "Bug found" below — this page failed silently before the DOMContentLoaded fix** |
| `coach/requests.html` | clean | same bug, same fix — confirmed independently (see below) |
| `coach/session.html` | clean | same bug, same fix |
| `coach/students.html` | clean | same bug, same fix |
| `coach/templates.html` | clean | same bug, same fix |
| `student/dashboard.html` | clean | same bug, same fix |
| `student/upcoming.html` | clean | same bug, same fix |

### Bug found by the required browser-driven verification (not by a console error)
T1.1's amended spec (`PLAN.md`) required *both* a browser console check *and* a
grep-shaped test, specifically because "a confident claim survived two review passes [in
Phase 0] because nothing mechanically checked it." The browser check caught something the
console-error check alone would have missed entirely.

**Symptom**: navigating fresh to `coach/attendance.html` and waiting 1s, `get_page_text`
showed both "Scheduled classes for this date" and "All sessions on this date" permanently
stuck on `Loading…`. `read_console_messages` (the browser tool's console-capture, not
necessarily equivalent to what a real Chrome DevTools console would show — see the note
below) reported no errors. Manually re-invoking `loadForDate()` from the browser console (a
few seconds later, in a separate call) worked immediately and rendered the page correctly.

**Diagnosis**: `PLAN.md`'s stated rationale for the load pattern — "`defer` guarantees it
executes after the DOM is parsed and before each page's existing inline block at the end
of `<body>`" — is backwards. Per the HTML spec, a `defer`red script's execution is
delayed until *after the whole document has finished parsing*, which is after any
ordinary (non-deferred) inline `<script>` in that same document has already run
synchronously during parsing. `app.js` is `defer`red; each page's trailing inline
`<script>` is not. Seven pages called their data-loading function immediately at the
bottom of that trailing script (`loadForDate()`, `loadRequests()`, `loadRoster()`,
`loadTemplates()`, `load()`, the IIFE in `student/dashboard.html`, `loadUpcoming()`) — and
each of those, as its first synchronous statement, referenced `fetchJson` (defined in
`app.js`) before `app.js` had run. Because the calling function is `async` and was invoked
with no `await`/`.catch()` at the call site, the resulting `ReferenceError` became an
**unhandled promise rejection**, and the page silently never populated.

**Correction (found at the post-review checkpoint)**: this report originally claimed the
rejection produced "no console output at all." That overstates what's actually guaranteed —
a real browser's console (e.g. Chrome DevTools) normally does log an unhandled promise
rejection automatically. What was actually observed is narrower: the browser-automation
tool's `read_console_messages` reported nothing, which may reflect that tool's
console-capture not hooking into unhandled-rejection events specifically, rather than the
error being invisible everywhere. The underlying bug this section describes is unaffected
by this correction — only the phrasing was imprecise. **The fix described immediately below
was later superseded** at the post-review checkpoint (see the branch's later commits): the
`DOMContentLoaded` workaround was replaced with a load-order fix (`app.js` loaded as a
plain, non-deferred script placed immediately before each page's own inline script, instead
of `defer`red in `<head>`), which removes the race at its source instead of routing around
it per page. This section is left as originally written for the historical record of how
the bug was first found and understood; it does not describe the code as it exists now.

**Reproduction, confirmed on a second page before assuming it was systemic**: same
symptom on `coach/requests.html` — stuck on `Loading…`, no error visible via the same
tool, fixed by the same change.

**Original fix (superseded — see note above)**: each affected page's final
`functionName();` call replaced with
`document.addEventListener('DOMContentLoaded', functionName);` — `DOMContentLoaded` fires
only after every deferred script (`app.js` included) has run, guaranteeing `fetchJson`/
`escapeHtml` are defined by the time the listener fires. Applied to:
`coach/attendance.html`, `coach/requests.html`, `coach/students.html`,
`coach/templates.html`, `coach/session.html`, `student/dashboard.html` (converted its IIFE
to a `DOMContentLoaded` listener), `student/upcoming.html`.

**Re-verified after the fix**, fresh navigation + 1s wait, all seven:
- `coach/attendance.html` → renders "Muay Thai · 18:00 - 19:00 · Create session", "No
  sessions created for this date yet." Console clean.
- `coach/requests.html` → renders the seeded pending request ("Pat Pending",
  `pending1@seed.test`). Console clean.
- `coach/session.html` (`?id=seed-session-mon-1`) → renders "Kickboxing Fundamentals",
  roster of 4 students. Console clean.
- `coach/students.html` → renders all 6 seeded students with correct status/actions.
  Console clean.
- `coach/templates.html` → renders Monday/Wednesday/Friday active templates. Console
  clean.
- `student/dashboard.html` (as `active1@seed.test`) → renders 2 attendance rows. Console
  clean.
- `student/upcoming.html` → renders 3 upcoming classes with RSVP buttons. Console clean.

This is recorded here, not silently fixed and left unmentioned, per `PLAN.md`'s own
repeated instruction to verify counterintuitive claims empirically and note anything that
turned out differently from the plan's description.

### Hamburger menu: opens, closes on link click, closes on scroll, locks body scroll — on all 9 pages that have one, `index.html` included
The Browser pane's coordinate-based `computer` click tool could not be used directly —
`computer{action:"screenshot"}` failed with "the Browser pane is not displayed, so the
page is not compositing frames," and a `computer left_click` on the hamburger button
(confirmed within its `getBoundingClientRect()`) produced zero effect and zero fired
`click` events (confirmed by a temporary counting listener). Interaction was instead
verified by dispatching a genuine `click()` on the actual DOM element via the JS
evaluation tool — the same `Event` the browser fires on a real tap, exercising the exact
same `app.js` listener — combined with `classList`/`aria-expanded`/`body-lock` assertions
before/after. This substitution is recorded as a discrepancy from "browser tool" as
literally specified, not concealed.

`index.html` (this is the page the `script.js`/`app.js` collision from T1.1's spec would
have broken, so it was tested deliberately, not assumed):
```json
{"opensOnClick":true,"closesOnLinkClick":true,"reopened":true,"closesOnScroll":true}
```

`coach/dashboard.html`:
```json
{"year":"2026","opensOnClick":true,"closesOnScroll":true}
```

`student/dashboard.html`:
```json
{"year":"2026","opensOnClick":true,"closesOnSecondClick":true}
```

Mobile viewport (375×812) re-check on `coach/attendance.html`, including the T1.2 "Home"
link (see T1.2 below):
```json
{"opensOnClick":true,"homeLinkVisible":true,"homeLinkText":"Home","closesOnLinkClick":true}
```
— and clicking the Home link inside the open mobile menu both closed the menu *and*
navigated to `/` (`window.location.pathname` was `"/"` immediately after), demonstrating
the full one-click path home from a mobile nav.

### Logout works from every page that offers it, and lands on `/login.html`
Exercised as part of switching between coach and student sessions for the rest of the
verification (not a synthetic no-op): `document.getElementById('logoutLink').click()` from
`coach/session.html` → `window.location.href` became `http://localhost:8788/login`
(Cloudflare Pages' clean-URL form of `/login.html`).

### The contact form on `index.html` still submits, and the header still hides on scroll-down
```
POST http://localhost:8788/api/contact → 500 Internal Server Error
```
(500 is expected in local dev — no `RESEND_API_KEY` is configured locally, so the
Function's own call to Resend fails; this exercises the exact same client JS path a real
failure would, and the client correctly displayed "Sorry, something went wrong. Please
WhatsApp us directly.") Header scroll-hide:
```json
{"before":false,"afterDown":true,"afterUp":false}
```

### The new grep-shaped test passes, and fails if `app.js` is removed from any one page
`test/unit/shared-frontend.test.mjs`, 12 tests, one per page. Run standalone:
```
✔ index.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ login.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ change-password.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ request-account.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ coach/dashboard.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ coach/attendance.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ coach/requests.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ coach/session.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ coach/students.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ coach/templates.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ student/dashboard.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
✔ student/upcoming.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
ℹ tests 12, pass 12, fail 0
```
**Proven to actually fail, not just execute**: temporarily stripped the `app.js` tag from
`index.html` and reran —
```
✖ index.html references /app.js?v= and has no leftover duplicated nav/escapeHtml code
ℹ tests 12, pass 11, fail 1
```
— then restored the file (confirmed via `git diff` showing only the intended one-line
addition) and reran to 12/12 green before proceeding.

### Net line count is lower than before
```
13 files changed, 54 insertions(+), 363 deletions(-)   (all 12 pages + script.js)
public/app.js: +56 (new file)
```
Net: **-253 lines**. `-363` removed (nav ×9, logout ×8, `escapeHtml` ×7, `#year` ×12,
plus the `fetch`→`.json()` boilerplate collapsed by `fetchJson` at ~16 call sites),
`+54` added back across the 13 touched files (mostly the one-line `<script defer>` tag on
each page), `+56` for `app.js` itself.

### `styles.css?v=` unchanged
No CSS was touched in T1.1; `styles.css?v=4` is unchanged on every page — confirmed by
inspection, no `styles.css` edits appear in the diff for this task.

---

## T1.2 — Fix the navigation dead ends

**Exit conditions and evidence:**

### From every authenticated page, a visible link reaches the public homepage in one click
Added `<a href="/">Home</a>` as the first nav item on all 8 authenticated pages. Verified
present via `grep -P 'nav-links">\s*<a href="/">Home' -r public` (multiline) → 8 files
matched: `coach/{dashboard,attendance,requests,session,students,templates}.html`,
`student/{dashboard,upcoming}.html`. Functionally verified on `coach/attendance.html`
(mobile viewport, see T1.1 above) — clicking it inside the open hamburger menu both closed
the menu and navigated to `/`.

### Homepage Login/My-dashboard swap
Logged out:
```html
<a href="/login.html">Login</a>
```
(unchanged; console clean)

Logged in as coach (`coach@seed.test`):
```html
<a href="/coach/dashboard.html">My dashboard</a>
```
(console clean)

Logged in as student (`active1@seed.test`):
```html
<a href="/student/dashboard.html">My dashboard</a>
```
(console clean)

### The session-state endpoint returns a negative answer for anonymous visitors without a 401, redirect, or console error
Integration test (`test/integration/route-protection.test.mjs`):
```
✔ session: anonymous -> 200 with user:null, not a 401 or redirect
```
asserts `res.status === 200` and `body.user === null` — not a 401, not a 3xx.

### The endpoint leaks nothing beyond name and role — exact key set asserted
```
✔ session: coach -> 200 with name+role only, exact key set
✔ session: student -> 200 with name+role only, exact key set
```
Both assert `Object.keys(body.user).sort()` deep-equals `['name', 'role']` exactly — not
just that `name`/`role` are present, which would pass even if `email`/`id` leaked too.

### Integration tests cover all three cases
All three (`anonymous`, `coach`, `student`) added to `test/integration/route-protection.test.mjs`,
the existing home for this suite's route-protection coverage, per the spec.

### `coach/session.html` has a back link returning to `coach/attendance.html` with the same date still selected
Opened a session for a **non-today** date (`seed-session-mon-1`, `session_date =
2026-08-03`; today in the seeded local clock is `2026-08-05`):
```
document.getElementById('backLink').href
→ "http://localhost:8788/coach/attendance.html?date=2026-08-03"
```
Navigated to that exact URL and checked the date input:
```
document.getElementById('dateInput').value → "2026-08-03"
```
Not today — the date round-tripped correctly.

### `attendance.html?date=` with a malformed value falls back to today without a console error
```
?date=banana         → dateInput.value === "2026-08-05" (today), console clean
?date=2026-02-30      → dateInput.value === "2026-08-05" (today), console clean
```
The second case specifically exercises the round-trip check (`Date` silently normalizes
Feb 30 → Mar 2 instead of erroring) — same technique as `_utils/dates.js`'s
server-side `isValidDate`, applied client-side since this parsing happens in the browser
before any request is made.

### Verified on mobile viewport as well as desktop
See T1.1's hamburger section above — the 375×812 check was run against
`coach/attendance.html` and covered both the hamburger and the new Home link in the same
pass. Desktop viewport reset and spot-checked afterward with no regressions.

---

## T1.3 — Documentation and merge

### Docs accurate — stale claims fixed, each re-read at its cited line before editing
Per `PLAN.md`'s "re-derive every finding's status from the code" rule (adopted after
Phase 0), each of the five claims below was opened and read at its cited location
**before** editing, not patched from the plan's description alone:

| Line (pre-edit) | Claim | Verified, then fixed to |
|---|---|---|
| `:150` | "Git repo root is `public/`" | Now states the outer folder is the root (`f0c3ec8`), `public/` is the deployed subtree, Cloudflare Root directory = `public` |
| `:229` | `test/` "untracked, same convention as `scripts/`" | Now states both are tracked, since `f0c3ec8` |
| `:313-314` | "All `wrangler d1`/`wrangler pages` commands... use plain `npx wrangler`" | Scoped to the documented maintenance commands only; local tooling's deliberate divergence (already explained at `:196-216`) now cross-referenced instead of contradicted |
| `:366` | "Four middleware files" | Now five, with `functions/docs/_middleware.js` (T0.8) added to the list — the same document already said five at `:244` |
| `:3` | Status line: "Phase 1, Phase 2 and Phase 3 complete (2026-08-04)" with no Phase 0/1 mention | Now notes Phase 0 and Phase 1 complete and merged (2026-08-05) |

Re-grepped the whole doc set afterward for residue: `wrangler@3`, `no test suite`, `Four
middleware`, `Git repo root is \`public/\``, `(untracked, same convention` — zero hits in
`coach-student-system.md` (remaining hits are in `HANDOVER.md`'s and `PLAN.md`'s own
past-tense task descriptions, which is correct — they're historical record, not living
claims about current state).

"Frontend notes" and "Shared code" sections rewritten for `app.js`'s existence (T1.1) and
the Home-link/session-swap behavior (T1.2). `/api/auth/session` added to the API reference
table.

### `/code-review ultra` — not yet run
User-triggered; this session cannot launch it. **Awaiting Giovanni.**

### `reports/phase-1-completion.md` — this document.

### Branch merged after confirmation
Not yet — `[HUMAN GATE]`, pending.

### Post-deploy verification against the live site
Not yet — sequenced after the merge deploys, same as Phase 0's T0.7.

---

## Logged, not fixed (T1.3 doc pass)

`coach/attendance.html`'s `todayLocalIso()` computes "today" from the **browser's**
timezone — a third notion of "today" alongside the server's SAST-fixed `todayIso()`
(`_utils/dates.js`, T0.6b) and plain UTC. Logged to `TODO.md`, deferred to Phase 2's T2.3
(the next-class panel builds directly on "today" for the coach dashboard) per `PLAN.md`'s
own Phase 1 section, which named this exact deferral in advance.

---

## Full test suite, current state

```
ℹ tests 52
ℹ suites 0
ℹ pass 52
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
37 from Phase 0, +12 from T1.1's grep-shaped regression test, +3 from T1.2's
`/api/auth/session` coverage.

---

## Summary

Phase 1 delivers what it set out to: `public/app.js` eliminates ~255 duplicated lines
across 12 pages (net -253 after the extraction's own additions), and the three navigation
dead ends Giovanni identified are closed. The phase's own required verification method —
browser console capture *and* a grep-shaped test, specified precisely because Phase 0
found that unverified claims survive review — caught a real, silent, systemic bug (7 of 12
pages failing to load their data with zero console evidence) that a console-error-only
check would have missed entirely, and that directly contradicted the task's own stated
rationale for its load pattern. That contradiction is recorded here rather than quietly
worked around, consistent with `PLAN.md`'s standing instruction to verify counterintuitive
claims empirically and report what turned out differently.

Nothing in this phase touched D1, migrations, or production — verified entirely against
`npm run dev`'s local environment, per the phase's stated scope.

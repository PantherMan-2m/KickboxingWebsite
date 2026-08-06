# Phase 1 — Shared frontend and navigation

**Status**: Built (T1.1 → T1.2 → T1.3), reviewed (`reports/phase-1-review.md`), bucket-1
fixes applied. **Not yet merged to `main`** as of 2026-08-06 — branch `phase-1-shared-frontend`
is ahead of `main` (`2b10dad`). See `HANDOVER.md` for current branch state and
`reports/phase-1-completion.md` for full evidence. This file is the task spec; read it
alongside `PLAN.md` while this phase is still open. Once merged, a session working on a
later phase should not need to read it — see `PLAN.md`'s "Keeping sessions cheap" section.

**Goal**: eliminate the per-page duplication before it multiplies, and fix the navigation dead
ends. These are one task set, not two, because both mean rewriting the header block on every
authenticated page — doing them separately means touching all eight files twice.

**Why now**: the refactor is cheap at 8 pages and expensive at the ~14 pages Phases 2–6 will
produce. Doing it after the foundation but before the features is the only time it's cheap.

**Risk note**: this touches every page of a working site. It happens on a branch, with
`stable-phase3` as the fallback, and every page is verified individually.

**What Phase 0 changed for this phase** (reviewed at the Phase 0 → 1 checkpoint, 2026-08-05).
The phase's shape is unchanged — still T1.1–T1.3, still the right next phase, still the cheap
moment to do it. Three things carry over:

1. **There is now a local environment to verify against** (`npm run dev`), so no part of Phase 1
   needs a production test account. Nothing here touches D1, so there is no migration, no backup
   gate, and no `--remote` command in the entire phase.
2. **The test suite cannot see any of this phase's exit conditions.** It is HTTP-only: no DOM, no
   console, no click. Every T1.1/T1.2 exit condition is browser-observable. T1.1 now specifies
   the verification method rather than leaving it implied — this is the direct application of
   Phase 0's recurring lesson, that a claim nothing mechanically checks is a claim that survives
   review while being false.
3. **The repo root moved** (`f0c3ec8`), so `app.js` at `public/app.js` is tracked normally and
   git commands run from the outer folder.

---

### T1.1 — Extract shared frontend code into `app.js`

**Depends on**: T0.7 (needs the local environment and test suite).
**Runs as**: Sonnet.

**Verified inventory** (checked against the code at the Phase 1 checkpoint, 2026-08-05):

| Duplicated block | Lines each | Pages |
|---|---|---|
| Nav/hamburger (toggle, close-on-link, close-on-scroll, body lock) | ~21 | 8 authenticated + `index.html` (in `script.js`) |
| Logout click handler | 5 | 8 authenticated |
| `escapeHtml` | 5 | 7 (all authenticated except `coach/dashboard.html`) |
| `#year` footer stamp | 1 | all 12 |

That is ~255 duplicated lines, not the ~30 an earlier draft of this task claimed. All 12 pages
currently carry a single inline `<script>` at the end of `<body>`; there is no external JS
anywhere except `index.html`'s `script.js`.

`login.html`, `change-password.html`, and `request-account.html` have a **logo-only header** —
no `.menu-toggle`, no `.nav-links`, no logout link. This is why every DOM lookup in `app.js`
must be guarded: those three pages will load it and find almost nothing.

Create `public/app.js` containing the shared behaviour. Extract at minimum: nav/hamburger
behaviour, logout handling, `escapeHtml`, the `#year` stamp, and a small `fetch` JSON wrapper
(every page repeats the same `fetch` → `.json()` → `if (data.ok)` shape).

#### The `script.js` collision — read this before writing anything

`public/script.js:2-30` **already implements the identical hamburger logic** for `index.html`,
and `script.js:33` already does the `#year` stamp. Load `app.js` alongside it unchanged and both
bind a click listener to the same `.menu-toggle`; both call `classList.toggle('open')`; the
class toggles twice per click and **the menu never opens**. An earlier draft of this task said
"do not change `script.js`" while also requiring `app.js` on `index.html` and a working
hamburger on every page — those three requirements cannot all hold.

**Resolution (decided by Giovanni, 2026-08-05)**: delete `script.js:1-33` — the nav block and
the `#year` line — and let `app.js` own them on `index.html` too. Everything below stays exactly
as it is:

- the contact-form submit handler (`script.js:51-78`) — untouched, and `functions/api/contact.js`
  is not part of this task either;
- the hide-header-on-scroll effect (`script.js:80-97`) — **stays in `script.js`, homepage-only**.
  It is deliberately not extracted: spreading it to 8 authenticated pages is a visible UX change
  and does not belong inside a refactor commit. Record the divergence in the completion report.

The history was checked for a reason the homepage needed its own menu implementation: there
isn't one. `066ff64` states the coach/student pages *replicated the homepage's* pattern inline
purely because no shared module existed, and the only documented blocker — `script.js`
referencing `#contactForm` — is about loading `script.js` elsewhere, not the reverse.

#### Load pattern — corrected at the post-review checkpoint (2026-08-06)

**This subsection originally specified `<script defer src="/app.js?v=1"></script>` in `<head>`,
reasoning that `defer` "executes after the DOM is parsed and before each page's existing inline
block at the end of `<body>`." That reasoning was backwards** — confirmed empirically, not just
by re-reading the spec, after it caused a real bug in the first implementation (see
`reports/phase-1-review.md` and `reports/phase-1-completion.md`). A `defer`red script's
execution is delayed until *after the whole document has finished parsing*, which is after any
ordinary (non-`defer`red) inline `<script>` already in that same document has run. The corrected
pattern, now what the code actually does:

- `<script src="/app.js?v=1"></script>` — a **plain script, not `defer`red** — placed
  immediately before each page's own trailing inline `<script>` block at the end of `<body>`.
  **Absolute path**, because pages sit at two directory depths (`/index.html` and
  `/coach/session.html`); a relative `app.js` breaks in one of them. **Versioned**, per this
  document's asset-versioning rule — a new asset with a 4-hour Cloudflare cache and no version
  string is unfixable for four hours after a bad deploy.
- Both `app.js` and the page's own script are ordinary blocking scripts, executed strictly in
  document order — `app.js` is guaranteed to finish before the page-specific script starts, so
  helpers like `escapeHtml`/`fetchJson` are always defined by the time that script runs, with no
  need for a `DOMContentLoaded` wrapper on the page's own init call.
- `index.html` loads `app.js` immediately before `<script src="script.js"></script>`, in that
  order, both plain scripts at the end of `<body>`.

#### Verification method (this phase has no mechanical check without one)

Phase 0's suite is HTTP-only — it cannot see a console error or a stuck menu, and every exit
condition below is DOM-observable. Phase 0's own lesson was that a confident claim survived two
review passes because nothing mechanically checked it. So do both:

1. **Browser-driven, per page.** With `npm run dev` running, load each of the 12 pages in the
   browser tool and capture console output. Paste the actual per-page result into the completion
   report — 12 lines of evidence, not one sentence claiming they were all fine.
2. **A grep-shaped regression test**, added to the suite: for each of the 12 pages, assert the
   served HTML references `/app.js?v=` and no longer contains a locally-duplicated copy of the
   nav toggle, logout handler, `escapeHtml`, or `#year` stamp. The realistic failure mode across
   12 near-identical files is *missing one*, and that is exactly what a human page-by-page sweep
   is worst at catching.

**Exit condition**:
- All 12 pages load with **zero console errors**, evidenced per page.
- The hamburger opens, closes on link click, closes on scroll, and locks body scroll — on all 9
  pages that have one, **`index.html` included** (this is the one the collision above breaks;
  test it deliberately, don't assume).
- Logout works from every page that offers it and lands on `/login.html`.
- The contact form on `index.html` still submits, and the header still hides on scroll-down
  there — proving the surviving half of `script.js` is intact.
- The new grep-shaped test passes, and fails if `app.js` is removed from any one page.
- Net line count across the touched files is **lower** than before. If it isn't, the extraction
  didn't achieve anything — report rather than proceeding.
- `styles.css?v=` bumped on every page if any CSS changed; unchanged if none did.

---

### T1.2 — Fix the navigation dead ends

**Depends on**: T1.1.
**Runs as**: Sonnet.

Three specific gaps identified by Giovanni:

1. **No way home.** Logged-in pages offer no route back to the public homepage. The `.logo`
   element links to `/`, but there is no explicit nav item and the behaviour isn't obvious.
2. **No way back into the app.** A logged-in user who reaches the homepage sees a "Login" link
   even though they're already authenticated, with no route back to their dashboard.
3. **No way back from a session.** `/coach/session.html?id=...` is reached from
   `/coach/attendance.html` and has no back link — the only exit is the browser button.

For (2), note the architectural constraint: `index.html` is a **static public page with no
middleware**, so it cannot know server-side whether the visitor is logged in. Resolve with a
lightweight client-side check — a small public endpoint returning session state (name + role,
nothing sensitive) that the homepage calls to swap "Login" for "My dashboard".

**Endpoint spec.** Put it at `public/functions/api/auth/session.js`. Verified: `functions/api/`
has middleware only under `api/coach/` and `api/student/`, so anything under `api/auth/` is
public by construction — no exclusion needed, and nothing to add to a middleware.

- Reuse `getSessionUser(context)` from `_utils/auth.js`. It returns `null` or
  `{sessionId, user:{id, email, name, role, mustChangePassword}}`.
- **Whitelist the two fields explicitly** — `{ok:true, user:{name, role}}`. Do not spread or
  return `session.user`, which carries `id`, `email`, and `mustChangePassword`. A spread here is
  the entire leak, and it is one character away from correct.
- Anonymous → `200 {ok:true, user:null}`. **Not** a 401, not a redirect. A 401 in the console on
  every homepage visit makes the public site look broken to anyone who opens devtools, and it
  trains the next person to ignore console noise.

For (3), `/coach/session.html`'s back link needs a target that preserves the date, and
**`/coach/attendance.html` cannot currently accept one**: `attendance.html` sets
`dateInput.value = todayLocalIso()` unconditionally on load and never reads the URL. So this is
two changes, not one:

- `attendance.html` reads `?date=YYYY-MM-DD`, validates it (reject a malformed value rather than
  feeding garbage to the date input), and falls back to today when absent or invalid.
- `session.html` builds the link as `/coach/attendance.html?date=${data.session.date}` once its
  fetch resolves. The session's date is already in the API response — no new endpoint. Render a
  plain `/coach/attendance.html` link immediately so there is never a window where the page has
  no way back; upgrade the `href` when the date arrives.

Audit every page for the same class of dead end while in here, and fix any others found.

**Exit condition**:
- From every authenticated page, a visible link reaches the public homepage in one click.
- Visiting `/` while logged in as a coach shows a link to `/coach/dashboard.html`; as a student,
  `/student/dashboard.html`; logged out, the existing "Login" link, unchanged.
- The session-state endpoint returns a negative answer for anonymous visitors **without** a 401,
  redirect, or console error — the homepage must not appear broken to the public.
- The endpoint leaks nothing beyond name and role. Explicitly: no email, no id, no
  `mustChangePassword`. **Assert the exact key set** in a test (`Object.keys(body.user)`), not
  just that the expected fields are present — a test that only checks `name` and `role` are
  there passes just as happily when `email` is there too.
- Integration tests cover all three cases: anonymous, coach, student. This is a new public
  endpoint; Phase 0's route-protection suite is the place it belongs.
- `/coach/session.html` has a back link returning to `/coach/attendance.html` with the same date
  still selected — demonstrated by opening a session for a **non-today** date and confirming the
  date input comes back on that date, not today.
- `attendance.html?date=` with a malformed value (`?date=banana`, `?date=2026-02-30`) falls back
  to today without a console error.
- Verified on mobile viewport as well as desktop, using T1.1's browser-driven method.

---

### T1.3 — Phase 1 documentation and merge

**Depends on**: T1.2.
**Runs as**: Sonnet, `[HUMAN GATE]` on merge/push.

Update the technical reference doc's "Frontend notes" section — the claim that every page has
its own inline script and that no shared module exists becomes false with T1.1. Add
`/api/auth/session` to the API reference table, and `app.js` to "Shared code".

**Stale claims found at the Phase 1 checkpoint** — all pre-existing, none caused by Phase 1, all
in the technical reference doc, all verified against the code on 2026-08-05. Fix them in this
same pass rather than leaving a doc that is wrong about the repo it documents:

- Git repo root claim — false since `f0c3ec8`; it is the outer folder.
- `test/`'s tracked status — both `test/` and `scripts/` are tracked now, for the same reason.
- The "all wrangler commands use plain npx wrangler" claim — the documented maintenance
  commands do; the local tooling deliberately does not. Scope the claim to the former.
- The middleware count — five, not four (`docs/_middleware.js` was added by T0.8).
- The status line — needs to mention Phase 0/1, not just Phase 1-3 (2026-08-04).

**Also log to `TODO.md`, do not fix here** (Bucket 2 — real, out of scope, and it belongs to the
phase that actually depends on it): `coach/attendance.html`'s `todayLocalIso()` computes "today"
from the **browser's** timezone, a third notion of today alongside the server's SAST `todayIso()`
fixed in T0.6b. They agree for a coach physically in South Africa and disagree for a traveller or
anyone on a VPN. Phase 2's next-class panel (T2.3) builds directly on this ground and is where it
should be resolved.

**Exit condition**:
- Docs accurate — no remaining stale claim from the list above, verified by re-reading each named
  line, not by grepping for a fix summary.
- An independent review runs on the branch before merge (see `PLAN.md`'s revised "Review
  policy" — a fresh Sonnet reviewer session by default; `/code-review ultra` only for Phases 4,
  7, 8), and its findings triaged per `PLAN.md`'s four-bucket rule with each finding re-checked
  at the `file:line` it names.
- `reports/phase-1-completion.md` written with per-task evidence, including the 12-page console
  capture from T1.1.
- Branch merged after confirmation.
- **Post-deploy verification against the live site**, not a preview: homepage, login, coach
  dashboard, student dashboard all load with no console error, the homepage swaps "Login" for
  "My dashboard" when logged in, and the contact form still submits. `app.js` is a new asset on
  every page at once — if it 404s or is cached wrong, every page breaks simultaneously, which is
  a larger blast radius than anything Phase 0 deployed.

# Phase 1 Review — local max-effort review (`/code-review ultra` fallback)

**Reviewed**: branch `phase-1-shared-frontend` vs `main` (2b10dad), diff at `5bd6788`.
**Method**: 10 parallel finder agents (5 correctness angles + 3 cleanup angles + altitude +
conventions), candidates deduplicated and independently verified against the current code by
the reviewing session before reporting. Ranked most-severe first.

---

1. **`HANDOVER.md:1`** — `HANDOVER.md` and `TODO.md` assert Phase 1 is "merged to main" while
   the branch is still 4 commits ahead of `main`, unmerged. Verdict: **CONFIRMED**.

2. **`public/app.js:13`** — `fetchJson()` has no error handling, and none of the 7 page-load
   functions that call it (`loadForDate`, `loadRequests`, `load`, `loadRoster`, `loadTemplates`,
   the `student/dashboard.html` IIFE, `loadUpcoming`) wrap it in try/catch. A network failure or
   non-JSON response leaves the page silently stuck on "Loading…" forever. Verdict: **CONFIRMED**.

3. **`public/coach/students.html:91`** — the activate/deactivate button handler still uses raw
   `fetch()` (result discarded) while the sibling `loadRoster()` in the same file was converted
   to `fetchJson`; same pattern in `public/student/upcoming.html:75` for the RSVP button. Mutation
   failures fail completely silently. Verdict: **CONFIRMED**.

4. **`public/coach/attendance.html:88`** — new `dateFromQuery()` reimplements the exact regex +
   UTC-round-trip validation algorithm already in the server-side `isValidDate()`
   (`public/functions/api/_utils/dates.js:9-16`), byte-for-byte identical, instead of being added
   to the new shared `public/app.js`. Verdict: **CONFIRMED**.

5. **`test/unit/shared-frontend.test.mjs:30`** — the new regression test only asserts 2 of the 4
   duplicated-code categories this same diff removed (app.js tag present, no
   `menuBtn.addEventListener`, no `function escapeHtml`) — it never checks for a reintroduced
   duplicate `#year` stamp or `logoutLink` handler, and doesn't test for the actual load-order bug
   (a synchronous call outside `DOMContentLoaded`) this branch found and fixed. Verdict:
   **CONFIRMED**.

6. **`public/coach/attendance.html:178`** — the `DOMContentLoaded`-wrapping fix is applied by
   hand to 7 separate HTML files, each carrying its own copy of an explanatory comment — a
   per-call-site bandaid for a document-level load-order fact. A future 8th page can easily
   forget to apply it, and the regression test (finding 5) wouldn't catch that either. Note: a
   commonly-suggested "cleaner fix" — giving each page's own inline `<script>` a `defer`
   attribute too — does **not** work; `defer` has no effect on scripts without a `src` attribute
   per the HTML spec. A genuinely viable alternative would be `type="module"` scripts or a custom
   "app-ready" event dispatched by `app.js`. Verdict: **PLAUSIBLE**.

7. **`public/app.js:33`** — the 3-statement "close the nav menu" sequence is written out twice
   inside `app.js` itself (the nav-link click handler and the scroll handler) — duplication
   reintroduced inside the very file created to eliminate it. Verdict: **CONFIRMED**.

8. **`public/functions/api/auth/session.js:16`** — `session.js` is the third independent
   hand-rolled whitelist of `session.user` fields in this codebase (alongside `login.js`'s
   `{id,name,role,mustChangePassword}` and `change-password.js`'s `{role}`), with no shared
   helper deriving any of them from one definition. Verdict: **PLAUSIBLE**.

9. **`public/student/dashboard.html:52`** — this page wraps its `DOMContentLoaded` listener in
   an anonymous async arrow function, while all 6 sibling data-loading pages use a named function
   + bare reference. Cosmetic only. Verdict: **CONFIRMED**.

10. **`public/coach/session.html:66`** — `load()`'s error branch interpolates `data.error`
    directly into `innerHTML` unescaped. Pre-existing pattern (this exact line is unchanged
    context in the diff), not currently exploitable since the API only ever returns a static
    string today. Verdict: **PLAUSIBLE**.

11. **`public/functions/api/auth/session.js:17`** — the new public, per-visitor-varying
    `GET /api/auth/session` endpoint sets no `Cache-Control`/`Vary` header. Speculative,
    low-confidence — Cloudflare Pages Functions aren't cached by default without an explicit
    opt-in. Verdict: **PLAUSIBLE**.

12. **`reports/phase-1-completion.md:51`** — the completion report's claim that the pre-fix bug
    produced "a silent, uncaught-in-promise ReferenceError with no console output at all" may
    overstate what's guaranteed — browsers normally do log unhandled promise rejections to the
    console by default. The empirical "No console logs" result was real (captured via the browser
    tool), but may reflect that tool's console-capture not hooking into unhandled-rejection
    events, not an absence of the error in a real browser. Verdict: **PLAUSIBLE**.

# Phase 1 Checkpoint Packet

**Branch**: `phase-1-shared-frontend`, `main` at `2b10dad`, branch at `5bd6788` (4 commits
ahead, unmerged). **Written by**: the same session that wrote the code and ran the review —
not the independent verifier PLAN.md's revised process calls for. Treat the verdicts below
as re-checked-against-code, not as independent confirmation; a genuinely separate session
should still spot-check 2-3 rows before trusting this table.

## What changed since `main`
T1.1 (`public/app.js` extraction, 12 pages), T1.2 (nav dead-ends, `/api/auth/session`,
session.html back-link), T1.3 (doc fixes, completion report), then a local max-effort review
(`reports/phase-1-review.md`, 12 findings) — not yet acted on before this packet.

## What is open
All bucket assignments for the 12 findings were given directly by Giovanni in this task (see
below) — no triage judgement calls remain open. The only decision left is whether the
verification table below changes any of those assignments; it doesn't.

## Verification table

Re-read fresh against the current working tree (no fixes applied yet). Verdict is
live / already-fixed / never-existed.

| # | file:line | current code (verbatim) | verdict |
|---|---|---|---|
| 1 | `HANDOVER.md:1` | `# Handover — Kickboxing Website (as of 2026-08-05, Phase 0 + Phase 1 — MERGED to \`main\`)` | **live** |
| 1b | `HANDOVER.md:126` | `## What happened this session (2026-08-05, Phase 1: shared frontend + navigation) — DONE, merged to \`main\`` | **live** |
| 1c | `TODO.md:92` | `## Phase 1 (shared frontend + navigation) — done and merged to \`main\`, see \`reports/phase-1-completion.md\`` | **live** |
| 2 | `public/app.js:13-17` | `async function fetchJson(url, options) {`⏎`  const response = await fetch(url, options);`⏎`  const data = await response.json();`⏎`  return { response, data };`⏎`}` — no try/catch anywhere in the function | **live** |
| 2b | `public/coach/attendance.html:110` | `const { data } = await fetchJson(\`/api/coach/sessions?date=${date}\`);` — no surrounding try | **live**, representative of all 7 loader call sites |
| 3a | `public/coach/students.html:91` | `await fetch(\`/api/coach/students/${btn.dataset.id}\`, {` — inside a `try`, but no `.ok`/`.json()` check on the response | **live** |
| 3b | `public/student/upcoming.html:75` | `await fetch('/api/student/rsvp', {` — same shape, same gap | **live** |
| 4 | `public/coach/attendance.html:88-94` | `function dateFromQuery() {`⏎`  const param = new URLSearchParams(...).get('date');`⏎`  if (!param \|\| !/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;`⏎`  const d = new Date(\`${param}T00:00:00Z\`);`⏎`  if (isNaN(d.getTime()) \|\| d.toISOString().slice(0, 10) !== param) return null;`⏎`  return param;`⏎`}` — identical algorithm to `_utils/dates.js:9-16`'s `isValidDate` | **live** — Giovanni's instruction rejects fixing this (build-step ban); no dispute with the duplication finding itself |
| 5 | `test/unit/shared-frontend.test.mjs:31-42` | asserts only `/app\.js\?v=/` present, `menuBtn\.addEventListener` absent, `function escapeHtml` absent — no assertion for `logoutLink` or `getElementById('year')` duplication, none for a synchronous (non-`DOMContentLoaded`) loader call | **live** |
| 6 | `public/coach/attendance.html:178,184` | comment block + `document.addEventListener('DOMContentLoaded', loadForDate);`, same shape independently in 6 more files | **live** |
| 7 | `public/app.js:34` and `:42` | `navMenu.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('body-lock');` — appears verbatim at both lines | **live** — **disagreement**: the review cited line 33 (the `addEventListener` wrapper); the actual duplicated 3-statement block starts at 34 and 42 |
| 8 | `public/functions/api/auth/session.js:16` | `return jsonResponse({ ok: true, user: { name: session.user.name, role: session.user.role } });` | **live** |
| 9 | `public/student/dashboard.html:52` | `document.addEventListener('DOMContentLoaded', async () => {` | **live** |
| 10 | `public/coach/session.html:66` | `rosterContainer.innerHTML = \`<p>${data.error \|\| 'Could not load session.'}</p>\`;` | **live**, pre-existing (confirmed via `git diff`: this exact line is unchanged context, not touched by this branch) |
| 11 | `public/functions/api/auth/session.js:17` | `}` (end of file — no `Cache-Control`/`Vary` set anywhere in the 17-line file) | **live** — **note**: citing line 17 specifically is imprecise (it's the closing brace); the claim is about absence across the whole file, not that line |
| 12 | `reports/phase-1-completion.md:63` | `**unhandled promise rejection with no visible console output**, and the page silently` | **live** — **disagreement**: the review quoted "no console output at all" at line 51; the actual text is "no visible console output" at line 63. Same substantive claim, imprecise quote/line |

## Disagreements worth flagging
Two citation-precision misses (7, 12) and one over-precise citation on an absence-claim (11).
None change a verdict — all 12 findings are live in the current code, none already fixed, none
never-existed. No finding should be downgraded on the strength of these misses.

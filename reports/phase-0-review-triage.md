# Phase 0 — `/code-review ultra` Triage (second pass)

**Triaged by**: Opus 5, 2026-08-05, acting as checkpoint reviewer.
**Input**: 11 findings from the second `/code-review ultra` pass, plus the executing
agent's fix summary for checkpoint items 1–4.
**Method**: every finding re-checked against the file it names. Status below is what the
code says, not what the fix summary says — the two disagreed on one finding.

Buckets are `PLAN.md`'s: (1) real bug in this phase → fix now; (2) real, out of scope →
log, don't expand the branch; (3) deliberate decision the reviewer lacked context for →
reject; (4) style preference → decline.

---

## Verified state

| # | Finding | Summary said | Code says |
|---|---|---|---|
| 1 | `cmd.exe` re-parses `& \| ^ %` despite argv array | fixed | **Fixed.** `devEnv.js:79` spawns `node <wrangler.js>` — no shell, any platform. |
| 2 | `rsvp.test.mjs` still `shell:true` | fixed | **Fixed.** `rsvp.test.mjs:89` uses `runWrangler()`. |
| 4 | `runWrangler()` masks spawn failures | fixed | **Fixed.** `devEnv.js:88` throws `result.error`. |
| 3 | `db-reset-seed.js` hardcodes `'cjn-academy'` | *absent* | **LIVE** — `db-reset-seed.js:51`, `:200`, `rsvp.test.mjs:89`. |
| 5 | `rsvp.js` window-before-template reorder | open | Live — `rsvp.js:35`. |
| 6 | `TEST_PORT=0` falsy-zero | open | Live — `server.mjs:37`. |
| 7 | `getD1Config()` trusts `d1_databases[0]` | open | Live — `devEnv.js:32`. |
| — | Tests hardcode `7`, not `RSVP_WINDOW_DAYS` | open | Live — `rsvp.test.mjs:27`. |
| — | Date-search loop duplicated 3× | open | Live — `rsvp.test.mjs:27`, `:77`, `:109`. |
| — | `resetAndSeed()` spawns a new Node process | open | Live — `server.mjs:41`. |
| — | `RSVP_WINDOW_DAYS` lives in generic `dates.js` | open | Live — `dates.js:7`. |

**Finding #3 was ranked third by severity, marked Confirmed, and appears in neither the
"fixed" nor the "still open" half of the fix summary.** It was found only by re-reading
the files. This is the third status claim on this branch that did not survive checking —
see "Process" at the end.

---

## Bucket 1 — fix now, on this branch

### #3 — `'cjn-academy'` hardcoded in local tooling
`db-reset-seed.js:51`, `db-reset-seed.js:200`, `rsvp.test.mjs:89`.

This is the exact drift class `devEnv.js` exists to eliminate, reappearing in the same
file family for `database_name` instead of `binding`. Leaving it makes `devEnv.js`'s
stated purpose false in its own callers.

**Do not switch these to the binding name.** The reviewer verified `d1 execute DB --local`
works but said nothing about `d1 migrations apply`, and that CLI semantic has not been
run here. Instead: have `getD1Config()` also return `database_name` from the config it
already parses, and use that at all three call sites. Same drift eliminated, no
uncertainty about wrangler's argument handling.

Occurrences of `cjn-academy` in **docs, `PLAN.md`, `README.md`, and migration file
headers are correct and must not be touched** — those are `--remote` production commands
where naming the database explicitly is the point.

### Tests hardcode the literal `7`
`rsvp.test.mjs:27`. T0.6b required the window derive from one shared constant so the two
sides cannot drift; the tests are the third side. Import `RSVP_WINDOW_DAYS` from
`dates.js`.

### Date-search loop duplicated 3×
`rsvp.test.mjs:27`, `:77`, `:109`. One helper, local to that file. Not a shared test-utils
module — the duplication is confined to one file and should stay that way.

### #7 — `getD1Config()` trusts `d1_databases[0]`
Marked Plausible, and there is exactly one D1 today. But it is the same failure mode as
#3 — silently operating on the wrong database — which is the thing Phase 0 exists to make
impossible. Take it in its **smallest form**: throw if `d1_databases.length > 1`. Two
lines. Not a redesign, not a selection mechanism.

### #5 — pin the current validation order with a test
See Bucket 3 for why the order stays. The reviewer is right that the change was
unintended and untested; one assertion makes it deliberate.

---

## Bucket 2 — log to `TODO.md`, do not fix here

### `resetAndSeed()` spawns a new Node process per test file
Re-flagged with "the reason it was deferred last round no longer applies." Possibly, but
making it in-process requires `db-reset-seed.js` to become importable and opens the door
to state leaking between test files. `PLAN.md` ranks a trustworthy safety net above
everything else, and this branch has already been reopened twice. The suite is ~65s.
Revisit when it becomes painful, not before.

---

## Bucket 3 — reject; deliberate, reviewer lacked context

### #5 — 400-before-404 in `rsvp.js`
The reorder stands. Checking the window before the DB lookup is cheaper, and it means a
bad `templateId` paired with an out-of-window date does not reveal whether the template
exists — consistent with this codebase's user-enumeration posture everywhere else
(identical generic 401s, generic request-account response). Reverting to 404-first would
trade a small information-leak improvement for nothing.

Action is a test, not a revert.

### `RSVP_WINDOW_DAYS` placement in `dates.js`
T0.6b explicitly mandated a *single shared constant imported by both* `rsvp.js` and
`upcoming.js`. `dates.js` is the module both already import. Relocating it creates a new
file whose entire content is one constant plus a third import in two handlers. The
current placement carries a comment explaining exactly why it is there. Declined.

---

## Bucket 4 — decline

### #6 — `TEST_PORT=0` falsy-zero
`server.mjs:37`. Textbook falsy-zero, and harmless: the reviewer themselves found the use
case it would enable ("let the OS pick a port") does not work with this design — `BASE_URL`
is built from `TEST_PORT` before the server starts, and `stdio: 'ignore'` means the code
can never learn an OS-assigned port. Changing `|| 8799` to `??` converts a silent no-op
into a server on a random port the suite hangs waiting for. The current behaviour is
accidentally correct.

Add a comment stating 0 is deliberately unsupported. No code change.

---

## Process — why this triage found something two reviews and a fix pass did not

Three status claims on this branch failed verification, each caught by a human or
reviewer re-reading the code, never by the process that produced the claim:

1. "Closes the whole bug class" — false, and it survived two `/code-review ultra` passes.
2. The completion report's branch history — said T0.1–T0.4 landed on `main`; they never did.
3. Finding #3 — Confirmed, severity-ranked third, then absent from the fix summary entirely.

Common root cause: **the agent that does the work also writes the status report, and the
report drifts from the code.** More diligence does not fix this; a mechanical check does.

**Rule adopted into `PLAN.md`**: before merging any phase branch, re-check each review
finding against the file and line it names, and record the `file:line` inspected. The
fix summary is an input to that check, never a substitute for it.

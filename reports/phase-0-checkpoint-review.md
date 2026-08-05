# Phase 0 Checkpoint Review

**Reviewer**: Opus 5, 2026-08-05. Independent verification of `reports/phase-0-completion.md`.
**Verdict**: strong work, **do not merge yet** — 4 outstanding items, 1 pending decision.
**Branch reviewed**: `phase-0-foundation` at `80a1928` (10 commits).

Written because these findings otherwise existed only in a chat context window — the same
single-copy problem as finding 5 below.

---

## Independently verified true

Not taken from the completion report — re-checked directly:

| Claim | Result |
|---|---|
| Test suite passes | **36/36, confirmed.** `npm test` re-run, 125.7s, 0 failures. |
| Tag `stable-phase3` exists and is pushed | Confirmed, peels to `44edd13` — matches the pre-Phase-0 HEAD recorded in `HANDOVER.md`. |
| `main` untouched | Confirmed. `main` = `44edd13` = `stable-phase3`. All 10 commits are branch-only. |
| Finding #5 fix is real | Confirmed. Seed output: `pending1@seed.test / PendingPass123! (pending, login blocked despite correct password)` — the status gate is now genuinely proven, not passing on a wrong-password rejection. |
| Backup exists, outside the repo | `backups/cjn-academy-2026-08-05.sql` present, outer folder. |
| Regression tests for review findings #1/#2 | Present, named after the findings, passing. |
| Working tree clean | Confirmed. |

**Worth crediting**: the T0.5 discovery that `--d1=DB=cjn-academy` silently binds a *different,
empty* local D1 than `wrangler d1 migrations apply --local` (which resolves via `database_id`,
not `database_name`) was proven by inspecting the actual `.sqlite` files under
`.wrangler/state/v3/d1/`. That is real verification, and it is exactly the class of bug Phase 0
existed to make findable.

---

## Outstanding items (sent to the executing agent 2026-08-05)

### 1. Push the branch — no upstream configured
`phase-0-foundation` has no remote tracking branch. Phase 0 exists on one disk.

### 2. "Closes the quoting-bug class entirely" is FALSE on Windows
Asserted in a code comment in `scripts/lib/devEnv.js`, in `coach-student-system.md`, and in the
completion report. It is wrong, and it survived **two** `/code-review ultra` passes.

Routing through `cmd.exe /d /s /c` with a real argv array does **not** stop cmd.exe interpreting
metacharacters. Node/libuv only quotes arguments containing space, tab, or double-quote — so a
bare `&` or `|` in a whitespace-free argument is still parsed by cmd.

Reproduction (run with `node`):

```js
const { spawnSync } = require('child_process');
for (const arg of ['A&echo', 'C:\\Tmp&x\\db', 'A|echo', 'A&echo WITH SPACE']) {
  const r = spawnSync('cmd.exe', ['/d','/s','/c','node','-e','console.log(process.argv[1])', arg],
                      { encoding: 'utf8' });
  console.log(JSON.stringify(arg), '=> exit', r.status, '| out:', JSON.stringify((r.stdout||'').trim()));
}
```

Observed:
```
"A&echo"            => out: "A\nECHO is on."   <- cmd split it; echo EXECUTED
"C:\Tmp&x\db"       => exit 1, out: "C:Tmp"    <- split at &, backslashes eaten
"A|echo"            => out: "ECHO is on."      <- pipe interpreted
"A&echo WITH SPACE" => intact                  <- whitespace triggers quoting
```

**Note the trap**: a first attempt at this test used `'A&echo PWNED'`, which came through
intact and looked like proof the fix worked — because the space triggered libuv's quoting. That
is almost certainly why the claim passed review. Any retest must use a whitespace-free payload.

Real-world exposure today is essentially nil — the arguments are UUIDs, computed dates, and a
`cwd` that isn't an argument. **The false claim is the problem, not the bug.**

Two acceptable resolutions; a false claim left standing is not one of them:
- **Make it true**: add `wrangler` as a devDependency and spawn
  `node node_modules/wrangler/bin/wrangler.js` directly — no shell on any platform, and it pins
  the Wrangler version, which is wanted for reproducibility regardless.
- **Correct all three claims** to state the real residual.

### 3. `shell: true` still present
`test/integration/rsvp.test.mjs:89` spawns wrangler with a joined string, `shell: true`, and
hand-escaped `\"` quoting — the exact pattern the fix claimed to remove, reintroduced by hand,
in the file that tests the fix. Input is safe (computed date + hardcoded IDs). `devEnv.js`
exists for this.

### 4. Completion report misstates its own branch history
It says T0.1–T0.4 "landed on `main` directly." They did not — `main` is untouched at `44edd13`
and all 10 commits are on the branch. Wrong in the safe direction, but the report is being used
as evidence, so its accuracy matters.

---

## 5. Pending decision — the foundation is untracked

**This is the structural finding, and no code review can catch it: it is not in the diff.**

`scripts/`, `test/`, `reports/`, and `package.json` all live in the **outer folder** — correctly
excluded from deployment, but also excluded from git. Combined with item 1, Phase 0's entire
deliverable (test harness, seed script, dev-server wrapper, shared config module) exists in one
place, on one machine, with no backup. If the disk fails, what survives is `stable-phase3` — the
state *before* Phase 0.

`TODO.md` already warns about this for `package.json`. The calculus changed once a test suite
became load-bearing infrastructure for nine remaining phases.

**Options:**
- **Move the git root up to the outer folder**, setting Cloudflare Pages' build output directory
  to `public/`. This is the conventional Pages setup. It was rejected earlier on the grounds that
  "Pages looks for `functions/` at the root of whatever it deploys" — true, but the
  output-directory setting is exactly what handles that. Cost: a repo restructure, a Pages
  settings change, and one deploy to verify. Should be its own task, with `stable-phase3` as the
  fallback. **Recommended.**
- **Accept it**: push the branch and treat the outer folder as disposable tooling.

**Awaiting Giovanni's decision.** Nothing else blocks on it.

---

## Plan defects found at this checkpoint

Both already corrected in `PLAN.md` — recorded here so the pattern is visible:

1. **T0.6b** described the RSVP day-of-week/window validation without saying it applies to
   *creation only*. Implemented literally and correctly per spec; the spec caused review finding
   #1 (cancellation permanently blocked). Now fixed with an explicit rationale.
2. **T0.7** had no post-deploy live-Functions smoke test, despite Phase 0 adding
   `functions/package.json` to the deployed tree on an *asserted, not verified* claim that
   Wrangler's bundler ignores it. Now required.

---

## Next actions, in order

1. Executing agent completes items 1–4 above.
2. Triage the `/code-review ultra` findings from the second pass — **full list first, no fixes
   until triaged**, using the four-bucket framework in `PLAN.md`'s execution model.
   Cross-check anything touching the `cmd.exe` quoting against item 2's evidence.
3. Giovanni decides the git-root question (item 5).
4. Merge `phase-0-foundation` to `main`. `[HUMAN GATE]`
5. Post-deploy live-Functions smoke test per the updated T0.7.
6. **Execute Phase 1** (shared `app.js` + navigation fixes) — already specified in full in
   `PLAN.md`, T1.1–T1.3. Nothing needs detailing first.

**Correction to an earlier instruction**: during planning, Giovanni was told the Phase 0
checkpoint would "detail Phase 3." That was wrong. Phases **1 and 2 are already specified in
full** and are next to execute, in that order. Phase 3 is the first phase needing just-in-time
detail, and that happens at the **Phase 2** checkpoint, not this one.

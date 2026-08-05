// Shared helper for integration tests: resets+seeds the local D1, starts a
// dedicated wrangler pages dev instance on TEST_PORT (separate from the
// developer-facing `npm run dev` on 8788, so running the suite doesn't fight
// a dev server someone left open), waits for it to become reachable, and
// tears it down cleanly afterwards.
//
// Same --d1=<binding>=<database_id> gotcha as scripts/dev-server.js applies
// here -- see coach-student-system.md's "Local development environment"
// section. PUBLIC_DIR, the D1 lookup, and the wrangler-spawning come from
// scripts/lib/devEnv.js (shared with dev-server.js and db-reset-seed.js) so
// all three always agree on the exact --d1 flag string; a stale hardcoded
// copy here previously silently pointed this test server at the wrong local
// database if the binding name in wrangler.jsonc ever changed.
//
// startServer() spawns `node <wrangler.js>` directly (via devEnv.js's
// wranglerCommand()) -- no shell, no `npx` .cmd shim -- so `child.pid` is the
// real wrangler-running node process, not a shell wrapping it. On POSIX this
// also passes `detached: true` so it becomes its own process-group leader --
// that's what makes stopServer()'s `process.kill(-child.pid, ...)` actually
// reach the whole process tree (wrangler/miniflare/workerd) instead of only
// the immediate child. Windows has no equivalent of POSIX process groups
// here; `taskkill /T /F` kills the tree by PID regardless.
//
// NOTE: the POSIX branch of stopServer() is correct by inspection only -- this
// project's dev machine is Windows, so it has not been exercised on Linux/Mac.

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import devEnv from '../../scripts/lib/devEnv.js';

const { PUBLIC_DIR, d1Flag, wranglerCommand } = devEnv;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// `|| 8799` (not `??`) is deliberate: TEST_PORT=0 ("let the OS pick a port")
// is unsupported by this design and must keep falling through to 8799, not
// through to 0. BASE_URL below is built from TEST_PORT before the server
// starts, and startServer() spawns with stdio: 'ignore', so there is no way
// for this module to ever learn an OS-assigned port -- an actual 0 would
// silently point BASE_URL at a server that will never come up on it.
export const TEST_PORT = Number(process.env.TEST_PORT) || 8799;
export const BASE_URL = `http://localhost:${TEST_PORT}`;

export function resetAndSeed() {
  const result = spawnSync('node', ['scripts/db-reset-seed.js'], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`db-reset-seed.js failed with status ${result.status}`);
  }
}

let child = null;

export async function startServer() {
  const { command, args } = wranglerCommand(['pages', 'dev', '.', '--port', String(TEST_PORT), d1Flag()]);

  child = spawn(command, args, {
    cwd: PUBLIC_DIR,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL + '/');
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Dev server did not become ready on ${BASE_URL} within 30s`);
}

export function stopServer() {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
  child = null;
}

// T3.1: a direct D1 binding for tests that exercise a DB-touching _utils
// helper without going through an HTTP endpoint. `wrangler`'s getPlatformProxy
// spins up the same local Miniflare/workerd D1 engine `wrangler pages dev`
// uses, and with `persist: true` it reads/writes the exact same on-disk state
// under public/.wrangler/state -- confirmed empirically by reading a row count
// written by a separate `wrangler pages dev` process. Call resetAndSeed() from
// server.mjs (or run migrations directly) before opening a proxy, and dispose()
// it when done so the test process can exit.
//
// `persist: true` resolves its storage path relative to `process.cwd()`, not
// relative to `configPath` -- verified empirically (an absolute `persist`
// string pointing at the right directory did NOT work; only chdir'ing into
// PUBLIC_DIR first did, matching how scripts/dev-server.js and db-reset-seed.js
// both spawn wrangler with `cwd: PUBLIC_DIR`). cwd is restored afterwards so it
// doesn't leak into the rest of the test process.
import { getPlatformProxy } from 'wrangler';
import devEnv from '../../scripts/lib/devEnv.js';

const { PUBLIC_DIR } = devEnv;

export async function openDb() {
  const originalCwd = process.cwd();
  process.chdir(PUBLIC_DIR);
  let proxy;
  try {
    proxy = await getPlatformProxy({ configPath: './wrangler.jsonc', persist: true });
  } finally {
    process.chdir(originalCwd);
  }
  return { db: proxy.env.DB, dispose: () => proxy.dispose() };
}

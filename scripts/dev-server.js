// Starts wrangler pages dev with D1 bound to the SAME local database that
// `db-reset-seed.js` migrates/seeds.
//
// Gotcha (verified 2026-08-05, wrangler 4.118.0): `wrangler pages dev` does NOT
// auto-detect `d1_databases` from wrangler.jsonc the way `wrangler dev` does --
// it needs an explicit --d1 flag. And that flag must reference the database by
// its `database_id`, not by `database_name`: passing the name creates a
// DIFFERENT (empty) local D1 instance than the one `wrangler d1 migrations
// apply --local` / `wrangler d1 execute --local` operate on, which resolve the
// database via wrangler.jsonc's config. Using the id makes both paths resolve
// to the same underlying local sqlite file under .wrangler/state/v3/d1. See
// scripts/lib/devEnv.js for the shared lookup (also used by db-reset-seed.js
// and test/helpers/server.mjs, so all three always agree) and for why this
// spawns wrangler directly via `node <wrangler.js>` instead of `npx wrangler`
// through a shell.
//
// Usage: node scripts/dev-server.js  (run from the outer project folder)

const { spawnSync } = require('child_process');
const { PUBLIC_DIR, getD1Config, d1Flag, wranglerCommand } = require('./lib/devEnv');

const PORT = process.env.PORT || 8788;

console.log(`Starting local dev server on http://localhost:${PORT} (D1 binding: ${getD1Config().binding})...`);

const { command, args } = wranglerCommand(['pages', 'dev', '.', '--port', String(PORT), d1Flag()]);
const result = spawnSync(command, args, { cwd: PUBLIC_DIR, stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);

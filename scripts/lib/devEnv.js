// Shared local-dev/test config: PUBLIC_DIR, wrangler.jsonc reading, the D1
// binding + database_id lookup, and wrangler command spawning that
// scripts/dev-server.js, scripts/db-reset-seed.js, and test/helpers/server.mjs
// all need to agree on byte-for-byte.
//
// Why the D1 lookup matters (verified 2026-08-05, wrangler 4.118.0, see
// coach-student-system.md's "Local development environment" section): `wrangler
// pages dev`'s local D1 identity is keyed off the EXACT --d1 flag string used.
// Two independently-written copies of this lookup previously drifted (one
// hardcoded the binding name as the literal "DB" instead of reading it from
// config) -- if the binding is ever renamed, that kind of drift silently points
// the dev server and the test server at two different local databases with no
// error. One shared module removes the possibility.
//
// CommonJS (matches scripts/*.js and this repo's untracked-outer-folder
// convention); test/helpers/server.mjs (ESM) imports this via the default
// export, since Node's ESM loader wraps a CJS module.exports as the default.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function getD1Config() {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, 'wrangler.jsonc'), 'utf8');
  const config = JSON.parse(stripJsonComments(raw));
  const dbs = config.d1_databases || [];
  if (dbs.length > 1) {
    throw new Error('Multiple d1_databases entries in wrangler.jsonc -- getD1Config() assumes exactly one');
  }
  const db = dbs[0];
  if (!db || !db.binding || !db.database_id || !db.database_name) {
    throw new Error('Could not find a d1_databases entry with binding + database_id + database_name in wrangler.jsonc');
  }
  return { binding: db.binding, databaseId: db.database_id, databaseName: db.database_name };
}

// The exact --d1=<binding>=<database_id> flag wrangler pages dev needs to bind
// to the SAME local D1 that `wrangler d1 migrations apply --local` / `d1 execute
// --local` operate on (those resolve the database via config, not this flag).
function d1Flag() {
  const { binding, databaseId } = getD1Config();
  return `--d1=${binding}=${databaseId}`;
}

// Resolves wrangler's actual bin script on disk via Node's own module
// resolution (works regardless of node_modules hoisting/layout). `wrangler`
// is a devDependency (outer package.json) specifically so this path exists
// and its version is pinned, rather than resolved fresh by npx every time.
function wranglerBinPath() {
  const pkgPath = require.resolve('wrangler/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return path.join(path.dirname(pkgPath), pkg.bin.wrangler);
}

// Resolves the {command, args} to spawn `wrangler <args>` as `node
// <wrangler.js> <args>` directly -- no shell, no `npx`, on any platform.
//
// This replaces an earlier version that routed through `npx` (with
// `cmd.exe /d /s /c` on Windows, since `npx` is a `.cmd` shim Node can't exec
// directly without a shell). That version's own comment claimed it "closes
// off the whole class of shell-metacharacter bugs" -- that claim was FALSE
// and shipped anyway: verified empirically that `spawnSync('cmd.exe',
// ['/d','/s','/c', ...args])` with an argument like `A&echo` still gets
// re-parsed by cmd.exe's own command-tail interpreter and `echo` still runs,
// because Node's argv-array quoting protects against the *target program's*
// standard argument parsing, not cmd.exe's own second-stage reparsing of
// whatever comes after `/c`. Node only quotes an argument at all if it
// contains whitespace/quotes, so a bare `&` or `|` with no adjacent
// whitespace sailed through unescaped regardless.
//
// Invoking `node <wrangler.js>` directly sidesteps the problem instead of
// trying to out-escape it: there is no cmd.exe, no `/bin/sh`, no second-stage
// command-tail parser anywhere in the process tree on any platform, so no
// argument value -- whatever characters it contains -- gets reinterpreted.
// `spawnSync`/`spawn` write argv directly to the OS process-creation API for
// a normal (non-shell) program in every case now, node.exe included.
function wranglerCommand(args) {
  return { command: process.execPath, args: [wranglerBinPath(), ...args] };
}

// Runs `wrangler <args>` to completion (e.g. migrations apply, d1 execute)
// and throws if it exits non-zero or never launched at all.
function runWrangler(args, options = {}) {
  const { command, args: fullArgs } = wranglerCommand(args);
  const result = spawnSync(command, fullArgs, { cwd: PUBLIC_DIR, stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(' ')} failed (exit ${result.status})`);
  }
  return result;
}

module.exports = { PUBLIC_DIR, stripJsonComments, getD1Config, d1Flag, wranglerCommand, runWrangler };

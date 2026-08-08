// Regression test for T1.1 (public/app.js extraction): the realistic failure
// mode across 12 near-identical files is missing the app.js tag -- or leaving
// a duplicated nav/escapeHtml block -- on just one of them. A human page-by-page
// sweep is worst at catching exactly that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const PAGES = [
  'index.html',
  'login.html',
  'change-password.html',
  'request-account.html',
  'coach/dashboard.html',
  'coach/attendance.html',
  'coach/requests.html',
  'coach/session.html',
  'coach/students.html',
  'coach/templates.html',
  'coach/payments.html',
  'student/dashboard.html',
  'student/upcoming.html',
];

for (const page of PAGES) {
  test(`${page} references /app.js?v= and has no leftover duplicated nav/logout/escapeHtml/year code`, () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, page), 'utf8');
    assert.match(html, /\/app\.js\?v=/, `expected ${page} to reference /app.js?v=`);
    assert.doesNotMatch(
      html,
      /menuBtn\.addEventListener/,
      `expected ${page} to have no leftover inline nav-toggle listener (should live in app.js only)`
    );
    assert.doesNotMatch(
      html,
      /function escapeHtml/,
      `expected ${page} to have no leftover local escapeHtml definition (should live in app.js only)`
    );
    assert.doesNotMatch(
      html,
      /getElementById\('logoutLink'\)\.addEventListener/,
      `expected ${page} to have no leftover inline logout handler (should live in app.js only)`
    );
    assert.doesNotMatch(
      html,
      /getElementById\('year'\)\.textContent\s*=/,
      `expected ${page} to have no leftover inline #year stamp (should live in app.js only)`
    );
  });
}

// T2.4: coach/attendance.html's own todayLocalIso() computed "today" from the browser's
// local timezone -- a third, disagreeing notion of "today" alongside the server's
// SAST-fixed todayIso() (_utils/dates.js). Replaced with app.js's sastTodayIso(), which
// duplicates _utils/dates.js's fixed +2 offset rather than importing it (no build step,
// so a plain browser <script> can't import a server ES module -- same tradeoff already
// accepted for dateFromQuery()/isValidDate() in Phase 1). Both copies must carry the same
// offset and todayLocalIso must be fully gone, not just unused.
test('app.js and _utils/dates.js carry the same fixed SAST offset, and todayLocalIso is gone', () => {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  const datesJs = fs.readFileSync(
    path.join(PUBLIC_DIR, 'functions', 'api', '_utils', 'dates.js'),
    'utf8'
  );
  assert.match(appJs, /function sastTodayIso/, 'expected app.js to define sastTodayIso');
  const offsetPattern = /2 \* 60 \* 60 \* 1000/;
  assert.match(appJs, offsetPattern, 'expected app.js to carry the same fixed SAST offset');
  assert.match(datesJs, offsetPattern, 'expected _utils/dates.js to carry the same fixed SAST offset');

  const attendanceHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'coach', 'attendance.html'), 'utf8');
  assert.doesNotMatch(attendanceHtml, /todayLocalIso/, 'expected todayLocalIso to be fully removed, not just unused');
  assert.match(attendanceHtml, /sastTodayIso\(\)/, 'expected coach/attendance.html to call the shared sastTodayIso()');
});

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
  'student/dashboard.html',
  'student/upcoming.html',
];

for (const page of PAGES) {
  test(`${page} references /app.js?v= and has no leftover duplicated nav/escapeHtml code`, () => {
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
  });
}

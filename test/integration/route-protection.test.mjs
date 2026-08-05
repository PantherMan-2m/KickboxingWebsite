import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';

before(async () => {
  resetAndSeed();
  await startServer();
});

after(() => {
  stopServer();
});

async function get(path, cookie) {
  return fetch(BASE_URL + path, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  });
}

// --- functions/coach/_middleware.js (static pages) ---

test('coach pages: unauthenticated -> redirect to /login.html', async () => {
  const res = await get('/coach/dashboard.html', null);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/login\.html$/);
});

test('coach pages: wrong role (student) -> redirect to /student/dashboard.html', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  const res = await get('/coach/dashboard.html', cookie);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/student\/dashboard\.html$/);
});

test('coach pages: must_change_password -> redirect to /change-password.html', async () => {
  const { cookie } = await login('coachmustchange@seed.test', 'TempPass123!');
  const res = await get('/coach/dashboard.html', cookie);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/change-password\.html$/);
});

// --- functions/student/_middleware.js (static pages) ---

test('student pages: unauthenticated -> redirect to /login.html', async () => {
  const res = await get('/student/dashboard.html', null);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/login\.html$/);
});

test('student pages: wrong role (coach) -> redirect to /coach/dashboard.html', async () => {
  const { cookie } = await login('coach@seed.test', 'CoachPass123!');
  const res = await get('/student/dashboard.html', cookie);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/coach\/dashboard\.html$/);
});

test('student pages: must_change_password -> redirect to /change-password.html', async () => {
  const { cookie } = await login('mustchange1@seed.test', 'TempPass123!');
  const res = await get('/student/dashboard.html', cookie);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/change-password\.html$/);
});

// --- functions/api/coach/_middleware.js (API routes) ---

test('coach API: unauthenticated -> 401 JSON', async () => {
  const res = await get('/api/coach/students', null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('coach API: wrong role (student) -> 403 JSON', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  const res = await get('/api/coach/students', cookie);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('coach API: must_change_password -> 403 JSON', async () => {
  const { cookie } = await login('coachmustchange@seed.test', 'TempPass123!');
  const res = await get('/api/coach/students', cookie);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.ok, false);
});

// --- functions/api/student/_middleware.js (API routes) ---

test('student API: unauthenticated -> 401 JSON', async () => {
  const res = await get('/api/student/upcoming', null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('student API: wrong role (coach) -> 403 JSON', async () => {
  const { cookie } = await login('coach@seed.test', 'CoachPass123!');
  const res = await get('/api/student/upcoming', cookie);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('student API: must_change_password -> 403 JSON', async () => {
  const { cookie } = await login('mustchange1@seed.test', 'TempPass123!');
  const res = await get('/api/student/upcoming', cookie);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.ok, false);
});

// --- functions/docs/_middleware.js (T0.8: gate internal docs behind coach auth) ---

test('docs: unauthenticated -> redirect to /login.html', async () => {
  const res = await get('/docs/coach-student-system.md', null);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/login\.html$/);
});

test('docs: coach -> serves the document', async () => {
  const { cookie } = await login('coach@seed.test', 'CoachPass123!');
  const res = await get('/docs/coach-student-system.md', cookie);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Coach\/Student Login/);
});

test('docs: wrong role (student) -> redirect to /student/dashboard.html', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  const res = await get('/docs/coach-student-system.md', cookie);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/student\/dashboard\.html$/);
});

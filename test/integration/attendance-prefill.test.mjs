// T2.5: pre-fill attendance from RSVPs. The actual pre-fill decision
// (usePrefill ? (going ? 'present' : 'absent') : status) lives client-side in
// coach/session.html, a plain <script> with no module system to unit test directly --
// but per the amended spec, the load-bearing part is the API contract this depends on:
// `attendanceSaved` and `going` must be correct, since the client's ternary is trivial
// once those are right. These tests pin that contract for all four exit-condition cases;
// a manual browser walkthrough additionally confirmed the actual rendering.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { dateForDowInWindow } from '../helpers/dates.mjs';
import devEnv from '../../scripts/lib/devEnv.js';

const { runWrangler, getD1Config } = devEnv;
const { databaseName } = getD1Config();

let coachCookie;

before(async () => {
  resetAndSeed();
  await startServer();
  ({ cookie: coachCookie } = await login('coach@seed.test', 'CoachPass123!'));
});

after(() => {
  stopServer();
});

async function getSession(id) {
  const res = await fetch(BASE_URL + `/api/coach/sessions/${id}`, { headers: { Cookie: coachCookie } });
  return res.json();
}

async function createFromTemplate(templateId, date) {
  const res = await fetch(BASE_URL + '/api/coach/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ templateId, date }),
  });
  const body = await res.json();
  return body.session.id;
}

function attendanceRowCount(sessionId) {
  const result = runWrangler(
    ['d1', 'execute', databaseName, '--local', '--json', `--command=SELECT COUNT(*) as n FROM attendance WHERE session_id = '${sessionId}'`],
    { stdio: 'pipe' }
  );
  return JSON.parse(result.stdout.toString())[0].results[0].n;
}

test('a never-saved session created from a template: attendanceSaved is false, RSVPd students show going:true, others going:false', async () => {
  const date = dateForDowInWindow(1); // seed-template-mon
  const { cookie: studentCookie } = await login('active1@seed.test', 'StudentPass123!');
  const rsvpRes = await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ templateId: 'seed-template-mon', date, going: true }),
  });
  assert.equal(rsvpRes.status, 200);

  const sessionId = await createFromTemplate('seed-template-mon', date);
  const body = await getSession(sessionId);

  assert.equal(body.session.attendanceSaved, false, 'a never-saved session must report attendanceSaved:false');
  assert.equal(body.session.templateId, 'seed-template-mon');

  const active1 = body.roster.find((r) => r.email === 'active1@seed.test');
  assert.ok(active1);
  assert.equal(active1.going, true, 'the RSVPd student must show going:true (client pre-fills present from this)');
  assert.equal(active1.status, 'absent', 'raw status is unaffected -- absent is the DB default until saved');

  const nonRsvpd = body.roster.filter((r) => r.email !== 'active1@seed.test');
  assert.ok(nonRsvpd.length > 0);
  for (const r of nonRsvpd) {
    assert.equal(r.going, false, `${r.email} did not RSVP, so going must be false`);
  }
});

test('opening a never-saved session and not saving writes zero attendance rows', async () => {
  const date = dateForDowInWindow(3); // seed-template-wed
  const sessionId = await createFromTemplate('seed-template-wed', date);

  await getSession(sessionId); // "open" it
  assert.equal(attendanceRowCount(sessionId), 0, 'opening without saving must write no attendance rows');
});

test('saved state beats RSVP pre-fill: a student marked absent and saved stays absent on reopen, even though they RSVPd going', async () => {
  const date = dateForDowInWindow(5); // seed-template-fri
  const { cookie: studentCookie } = await login('active1@seed.test', 'StudentPass123!');
  await fetch(BASE_URL + '/api/student/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
    body: JSON.stringify({ templateId: 'seed-template-fri', date, going: true }),
  });

  const sessionId = await createFromTemplate('seed-template-fri', date);
  const before1 = await getSession(sessionId);
  assert.equal(before1.session.attendanceSaved, false);
  const active1Before = before1.roster.find((r) => r.email === 'active1@seed.test');
  assert.equal(active1Before.going, true);

  // Save the whole roster, deliberately marking the RSVPd student absent (a coach
  // correcting the pre-fill because they didn't actually show up).
  const records = before1.roster.map((r) => ({
    userId: r.id,
    status: r.email === 'active1@seed.test' ? 'absent' : 'present',
  }));
  const saveRes = await fetch(BASE_URL + '/api/coach/mark-attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ sessionId, records }),
  });
  assert.equal(saveRes.status, 200);

  // Reopen: attendanceSaved must now be true, and the saved 'absent' must win over the
  // RSVP's going:true -- this is the regression that matters most.
  const after1 = await getSession(sessionId);
  assert.equal(after1.session.attendanceSaved, true, 'a saved session must report attendanceSaved:true');
  const active1After = after1.roster.find((r) => r.email === 'active1@seed.test');
  assert.equal(active1After.going, true, 'going still reflects the real RSVP -- unrelated to what was saved');
  assert.equal(active1After.status, 'absent', 'the saved absent status must win over the RSVP pre-fill on reopen');
});

test('a one-off session (no template) has no RSVPs -- every roster entry defaults to going:false, status:absent', async () => {
  const date = dateForDowInWindow(2); // any date; one-off sessions aren't tied to a weekday
  const res = await fetch(BASE_URL + '/api/coach/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coachCookie },
    body: JSON.stringify({ date, name: 'Extra sparring session' }),
  });
  assert.equal(res.status, 200);
  const { session } = await res.json();

  const body = await getSession(session.id);
  assert.equal(body.session.templateId, null);
  assert.equal(body.session.attendanceSaved, false);
  assert.ok(body.roster.length > 0);
  for (const r of body.roster) {
    assert.equal(r.going, false, 'a one-off session has no template to RSVP against, so going must always be false');
    assert.equal(r.status, 'absent');
  }
});

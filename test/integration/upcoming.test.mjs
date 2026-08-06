// T2.4: pins /api/student/upcoming's window and ordering BEFORE the expandTemplates()
// refactor extracts its date/template expansion logic into _utils/ for reuse by
// /api/coach/next-class -- so the refactor is provably behaviour-preserving rather than
// hopefully so. Written against seed-template-mon/wed/fri (active) and
// seed-template-sat-inactive (inactive, must never appear).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer, BASE_URL } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';
import { todayIso, addDaysIso, dayOfWeekFor, RSVP_WINDOW_DAYS } from '../../public/functions/api/_utils/dates.js';

before(async () => {
  resetAndSeed();
  await startServer();
});

after(() => {
  stopServer();
});

const SEED = {
  1: { templateId: 'seed-template-mon', name: 'Kickboxing Fundamentals', startTime: '18:00' },
  3: { templateId: 'seed-template-wed', name: 'Muay Thai', startTime: '18:00' },
  5: { templateId: 'seed-template-fri', name: 'Kids Class', startTime: '17:30' },
};

test('upcoming window covers exactly today..today+6, one occurrence per active weekday, sorted by date+startTime, no inactive templates', async () => {
  const { cookie } = await login('active1@seed.test', 'StudentPass123!');
  const res = await fetch(BASE_URL + '/api/student/upcoming', { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  const today = todayIso();
  const windowEnd = addDaysIso(today, RSVP_WINDOW_DAYS - 1);

  // Every entry must fall within [today, today+6].
  for (const entry of body.upcoming) {
    assert.ok(entry.date >= today && entry.date <= windowEnd, `date ${entry.date} outside window [${today}, ${windowEnd}]`);
  }

  // The inactive Saturday template must never appear.
  assert.ok(
    !body.upcoming.some((e) => e.templateId === 'seed-template-sat-inactive'),
    'inactive template must not appear in upcoming'
  );

  // Exactly 3 entries: one Mon, one Wed, one Fri, each within the window -- deterministic
  // because a 7-day window contains exactly one occurrence of each weekday.
  assert.equal(body.upcoming.length, 3);

  const expected = Object.entries(SEED).map(([dow, t]) => {
    let date = today;
    for (let i = 0; i < RSVP_WINDOW_DAYS; i++) {
      const candidate = addDaysIso(today, i);
      if (dayOfWeekFor(candidate) === Number(dow)) {
        date = candidate;
        break;
      }
    }
    return { templateId: t.templateId, date, startTime: t.startTime };
  });
  expected.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  const actual = body.upcoming.map((e) => ({ templateId: e.templateId, date: e.date, startTime: e.startTime }));
  assert.deepEqual(actual, expected, 'exact set and order of upcoming entries must match the expected expansion');
});

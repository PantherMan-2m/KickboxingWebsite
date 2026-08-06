import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandTemplates, selectNextClass } from '../../public/functions/api/_utils/schedule.js';
import { sastNowParts, addDaysIso, dayOfWeekFor } from '../../public/functions/api/_utils/dates.js';

const templates = [
  { id: 'mon', dayOfWeek: 1, name: 'Monday Class', startTime: '18:00', endTime: '19:00' },
  { id: 'wed-early', dayOfWeek: 3, name: 'Early Wednesday', startTime: '06:00', endTime: '07:00' },
  { id: 'wed-late', dayOfWeek: 3, name: 'Late Wednesday', startTime: '18:00', endTime: '19:00' },
];

test('expandTemplates matches each template only against dates with the same day-of-week', () => {
  // 2026-08-03 = Monday, 2026-08-05 = Wednesday, 2026-08-06 = Thursday.
  const dates = ['2026-08-03', '2026-08-05', '2026-08-06'];
  const result = expandTemplates(templates, dates);
  assert.deepEqual(
    result.map((r) => `${r.templateId}|${r.date}`),
    ['mon|2026-08-03', 'wed-early|2026-08-05', 'wed-late|2026-08-05']
  );
});

test('expandTemplates sorts by date then startTime, not template list order', () => {
  const dates = ['2026-08-05']; // Wednesday -- both wed templates match, late listed first in input
  const result = expandTemplates(
    [
      { id: 'wed-late', dayOfWeek: 3, name: 'Late', startTime: '18:00', endTime: '19:00' },
      { id: 'wed-early', dayOfWeek: 3, name: 'Early', startTime: '06:00', endTime: '07:00' },
    ],
    dates
  );
  assert.deepEqual(result.map((r) => r.templateId), ['wed-early', 'wed-late']);
});

test('expandTemplates returns an empty array when no template matches any date', () => {
  const dates = ['2026-08-04']; // Tuesday -- none of the seed templates run on Tuesday
  assert.deepEqual(expandTemplates(templates, dates), []);
});

test('expandTemplates preserves name/startTime/endTime on each expanded entry', () => {
  const result = expandTemplates(templates, ['2026-08-03']);
  assert.deepEqual(result[0], { templateId: 'mon', date: '2026-08-03', name: 'Monday Class', startTime: '18:00', endTime: '19:00' });
});

test('selectNextClass returns null when nothing is scheduled in the window', () => {
  const result = selectNextClass([{ id: 'tue', dayOfWeek: 2, name: 'Tuesday Class', startTime: '18:00', endTime: '19:00' }], '2026-08-05', '10:00', 1);
  assert.equal(result, null); // window is just 2026-08-05 (Wednesday), Tuesday never occurs
});

test('selectNextClass keeps a class starting at exactly the current time (>=, not >)', () => {
  const result = selectNextClass(
    [{ id: 'wed', dayOfWeek: 3, name: 'Wednesday Class', startTime: '10:00', endTime: '11:00' }],
    '2026-08-05',
    '10:00',
    1
  );
  assert.ok(result, 'a class starting this exact minute must still count as next');
  assert.equal(result.templateId, 'wed');
});

test('selectNextClass excludes a class today that already started, but keeps one later today', () => {
  const templates = [
    { id: 'early', dayOfWeek: 3, name: 'Already started', startTime: '06:00', endTime: '07:00' },
    { id: 'later', dayOfWeek: 3, name: 'Later today', startTime: '18:00', endTime: '19:00' },
  ];
  const result = selectNextClass(templates, '2026-08-05', '10:00', 7);
  assert.equal(result.templateId, 'later', 'the already-started class must be excluded, the later one must win');
});

test('selectNextClass rolls a class whose day already happened this week to the end of the window (last class of the week -> next week)', () => {
  // Today is Wednesday (2026-08-05); a template that only runs on Tuesdays already had
  // its occurrence this week -- the next one is 6 days out, at the window's far edge.
  const templates = [{ id: 'tue', dayOfWeek: 2, name: 'Tuesday Class', startTime: '10:00', endTime: '11:00' }];
  const result = selectNextClass(templates, '2026-08-05', '00:00', 7);
  assert.equal(result.date, '2026-08-11'); // next Tuesday, 6 days later
  assert.equal(dayOfWeekFor(result.date), 2);
});

test('selectNextClass does not show a class that already finished yesterday, using SAST not UTC (regression: T0.6b at feature level)', () => {
  // 2026-08-04T23:30:00Z is 2026-08-05 01:30 SAST. A UTC-based implementation would
  // still believe it's 2026-08-04 and could surface Monday's class as upcoming even
  // though, in SAST, it already finished the previous evening.
  const simulatedNow = new Date('2026-08-04T23:30:00Z');
  const { date: today, time: nowTime } = sastNowParts(simulatedNow);
  assert.equal(today, '2026-08-05'); // Wednesday in SAST

  const templates = [
    { id: 'mon', dayOfWeek: 1, name: 'Monday Class', startTime: '18:00', endTime: '19:00' }, // already gone
    { id: 'wed', dayOfWeek: 3, name: 'Wednesday Class', startTime: '18:00', endTime: '19:00' },
  ];
  const result = selectNextClass(templates, today, nowTime, 7);
  assert.equal(result.templateId, 'wed');
  assert.notEqual(result.date, '2026-08-03', 'the already-finished Monday must never be selected');
});

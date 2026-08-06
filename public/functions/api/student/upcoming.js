import { jsonResponse } from '../_utils/auth.js';
import { todayIso, addDaysIso, RSVP_WINDOW_DAYS } from '../_utils/dates.js';
import { expandTemplates } from '../_utils/schedule.js';

export async function onRequestGet(context) {
  const start = todayIso();
  const dates = Array.from({ length: RSVP_WINDOW_DAYS }, (_, i) => addDaysIso(start, i));

  const { results: templates } = await context.env.DB.prepare(
    `SELECT id, day_of_week AS dayOfWeek, name, start_time AS startTime, end_time AS endTime, capacity
     FROM class_templates WHERE active = 1`
  ).all();
  const templateCapacityMap = new Map(templates.map((t) => [t.id, t.capacity]));

  const { results: rsvps } = await context.env.DB.prepare(
    `SELECT template_id AS templateId, session_date AS date FROM session_rsvps
     WHERE user_id = ? AND session_date BETWEEN ? AND ?`
  )
    .bind(context.data.user.id, dates[0], dates[dates.length - 1])
    .all();
  const goingSet = new Set(rsvps.map((r) => `${r.templateId}|${r.date}`));

  // One grouped query for everyone's RSVP counts across the whole window, not one
  // COUNT(*) per row. Named `attending`, not `going` -- `going` already means "am *I*
  // going" on the same row, and shadowing it here would be a bug waiting to happen.
  const { results: counts } = await context.env.DB.prepare(
    `SELECT template_id AS templateId, session_date AS date, COUNT(*) AS n
     FROM session_rsvps WHERE session_date BETWEEN ? AND ?
     GROUP BY template_id, session_date`
  )
    .bind(dates[0], dates[dates.length - 1])
    .all();
  const attendingMap = new Map(counts.map((c) => [`${c.templateId}|${c.date}`, c.n]));

  // Session-level capacity overrides in the window, for the same
  // COALESCE(session.capacity, template.capacity) resolution rule T2.2/T2.3 use
  // elsewhere. Map value may legitimately be null (a session row exists but its
  // capacity column means "inherit") -- that falls through to the template below
  // exactly like a missing row does.
  const { results: sessionOverrides } = await context.env.DB.prepare(
    `SELECT template_id AS templateId, session_date AS date, capacity
     FROM class_sessions WHERE template_id IS NOT NULL AND session_date BETWEEN ? AND ?`
  )
    .bind(dates[0], dates[dates.length - 1])
    .all();
  const overrideMap = new Map(sessionOverrides.map((s) => [`${s.templateId}|${s.date}`, s.capacity]));

  const upcoming = expandTemplates(templates, dates).map((e) => {
    const key = `${e.templateId}|${e.date}`;
    const sessionCapacity = overrideMap.get(key);
    const capacity = sessionCapacity !== undefined && sessionCapacity !== null ? sessionCapacity : templateCapacityMap.get(e.templateId);
    const attending = attendingMap.get(key) || 0;
    return {
      ...e,
      going: goingSet.has(key),
      capacity,
      attending,
      full: capacity !== null && attending >= capacity,
    };
  });

  return jsonResponse({ ok: true, upcoming });
}

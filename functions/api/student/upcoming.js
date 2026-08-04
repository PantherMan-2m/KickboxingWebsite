import { jsonResponse } from '../_utils/auth.js';
import { dayOfWeekFor, todayIso, addDaysIso } from '../_utils/dates.js';

const WINDOW_DAYS = 7;

export async function onRequestGet(context) {
  const start = todayIso();
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysIso(start, i));

  const { results: templates } = await context.env.DB.prepare(
    `SELECT id, day_of_week AS dayOfWeek, name, start_time AS startTime, end_time AS endTime
     FROM class_templates WHERE active = 1`
  ).all();

  const { results: rsvps } = await context.env.DB.prepare(
    `SELECT template_id AS templateId, session_date AS date FROM session_rsvps
     WHERE user_id = ? AND session_date BETWEEN ? AND ?`
  )
    .bind(context.data.user.id, dates[0], dates[dates.length - 1])
    .all();
  const goingSet = new Set(rsvps.map((r) => `${r.templateId}|${r.date}`));

  const upcoming = [];
  for (const date of dates) {
    const dow = dayOfWeekFor(date);
    for (const t of templates) {
      if (t.dayOfWeek !== dow) continue;
      upcoming.push({
        templateId: t.id,
        date,
        name: t.name,
        startTime: t.startTime,
        endTime: t.endTime,
        going: goingSet.has(`${t.id}|${date}`),
      });
    }
  }
  upcoming.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  return jsonResponse({ ok: true, upcoming });
}

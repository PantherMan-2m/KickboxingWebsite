import { jsonResponse } from '../_utils/auth.js';
import { sastNowParts, RSVP_WINDOW_DAYS } from '../_utils/dates.js';
import { selectNextClass } from '../_utils/schedule.js';
import { waitlistCount } from '../_utils/waitlist.js';

export async function onRequestGet(context) {
  const { date: today, time: nowTime } = sastNowParts();

  const { results: templates } = await context.env.DB.prepare(
    `SELECT id, day_of_week AS dayOfWeek, name, start_time AS startTime, end_time AS endTime, capacity
     FROM class_templates WHERE active = 1`
  ).all();
  const templateCapacityMap = new Map(templates.map((t) => [t.id, t.capacity]));

  const next = selectNextClass(templates, today, nowTime, RSVP_WINDOW_DAYS);

  if (!next) {
    return jsonResponse({ ok: true, nextClass: null });
  }

  // Effective capacity: COALESCE(class_sessions.capacity, class_templates.capacity) --
  // same resolution rule as T2.2/T2.3. The session row may not exist yet.
  const session = await context.env.DB.prepare(
    'SELECT capacity FROM class_sessions WHERE template_id = ? AND session_date = ?'
  )
    .bind(next.templateId, next.date)
    .first();
  const capacity = session && session.capacity !== null ? session.capacity : templateCapacityMap.get(next.templateId);

  const attendingRow = await context.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM session_rsvps WHERE template_id = ? AND session_date = ? AND status = 'going'"
  )
    .bind(next.templateId, next.date)
    .first();
  const attending = attendingRow.n;
  const waitlisted = await waitlistCount(context.env.DB, next.templateId, next.date);

  return jsonResponse({
    ok: true,
    nextClass: {
      templateId: next.templateId,
      name: next.name,
      date: next.date,
      startTime: next.startTime,
      endTime: next.endTime,
      attending,
      capacity,
      spotsRemaining: capacity === null ? null : Math.max(0, capacity - attending),
      waitlisted,
    },
  });
}

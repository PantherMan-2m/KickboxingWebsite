import { jsonResponse } from '../_utils/auth.js';
import { isValidDate, todayIso, addDaysIso, dayOfWeekFor } from '../_utils/dates.js';

// Must match the window student/upcoming.js projects -- an RSVP for a date the
// UI never offered would be a class that either already matched a different
// weekday or is further out than students can even see yet.
const WINDOW_DAYS = 7;

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const { templateId, date, going } = body;
  if (!templateId || !date || !isValidDate(date) || typeof going !== 'boolean') {
    return jsonResponse(
      { ok: false, error: 'templateId, a valid date, and going (boolean) are required' },
      { status: 400 }
    );
  }
  if (date < todayIso()) {
    return jsonResponse({ ok: false, error: 'Cannot RSVP to a past date' }, { status: 400 });
  }
  if (date > addDaysIso(todayIso(), WINDOW_DAYS - 1)) {
    return jsonResponse({ ok: false, error: 'Date is outside the upcoming class window' }, { status: 400 });
  }

  const template = await context.env.DB.prepare(
    'SELECT id, day_of_week FROM class_templates WHERE id = ? AND active = 1'
  )
    .bind(templateId)
    .first();
  if (!template) {
    return jsonResponse({ ok: false, error: 'Class not found' }, { status: 404 });
  }
  if (dayOfWeekFor(date) !== template.day_of_week) {
    return jsonResponse({ ok: false, error: 'Date does not match this class\'s weekday' }, { status: 400 });
  }

  if (going) {
    await context.env.DB.prepare(
      `INSERT INTO session_rsvps (template_id, session_date, user_id) VALUES (?, ?, ?)
       ON CONFLICT(template_id, session_date, user_id) DO NOTHING`
    )
      .bind(templateId, date, context.data.user.id)
      .run();
  } else {
    await context.env.DB.prepare(
      `DELETE FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?`
    )
      .bind(templateId, date, context.data.user.id)
      .run();
  }

  return jsonResponse({ ok: true });
}

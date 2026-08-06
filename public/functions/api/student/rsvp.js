import { jsonResponse } from '../_utils/auth.js';
import { parseJsonBody } from '../_utils/body.js';
import { isValidDate, todayIso, addDaysIso, dayOfWeekFor, RSVP_WINDOW_DAYS } from '../_utils/dates.js';

export async function onRequestPost(context) {
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const { templateId, date, going } = parsed.body;
  if (!templateId || !date || !isValidDate(date) || typeof going !== 'boolean') {
    return jsonResponse(
      { ok: false, error: 'templateId, a valid date, and going (boolean) are required' },
      { status: 400 }
    );
  }
  if (date < todayIso()) {
    return jsonResponse({ ok: false, error: 'Cannot RSVP to a past date' }, { status: 400 });
  }

  if (going) {
    // Window and day-of-week validation apply to *creating* an RSVP only.
    // Cancellation (going: false, below) requires nothing beyond owning the
    // row: gating it on these same rules would make a row permanently
    // undeletable the moment its date falls outside the window, or a coach
    // edits the template's day_of_week after RSVPs already exist against it.
    if (date > addDaysIso(todayIso(), RSVP_WINDOW_DAYS - 1)) {
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

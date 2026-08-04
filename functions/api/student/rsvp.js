import { jsonResponse } from '../_utils/auth.js';
import { isValidDate, todayIso } from '../_utils/dates.js';

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

  const template = await context.env.DB.prepare(
    'SELECT id FROM class_templates WHERE id = ? AND active = 1'
  )
    .bind(templateId)
    .first();
  if (!template) {
    return jsonResponse({ ok: false, error: 'Class not found' }, { status: 404 });
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

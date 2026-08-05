import { jsonResponse } from '../_utils/auth.js';
import { isValidDate, dayOfWeekFor } from '../_utils/dates.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const date = url.searchParams.get('date');
  if (!date || !isValidDate(date)) {
    return jsonResponse({ ok: false, error: 'date=YYYY-MM-DD query param is required' }, { status: 400 });
  }

  const dow = dayOfWeekFor(date);

  const { results: templatesForDay } = await context.env.DB.prepare(
    `SELECT t.id AS templateId, t.name, t.start_time AS startTime, t.end_time AS endTime,
            cs.id AS sessionId
     FROM class_templates t
     LEFT JOIN class_sessions cs ON cs.template_id = t.id AND cs.session_date = ?
     WHERE t.day_of_week = ? AND t.active = 1
     ORDER BY t.start_time`
  )
    .bind(date, dow)
    .all();

  const { results: sessions } = await context.env.DB.prepare(
    `SELECT id, session_date AS date, name, start_time AS startTime, end_time AS endTime, template_id AS templateId
     FROM class_sessions WHERE session_date = ? ORDER BY start_time`
  )
    .bind(date)
    .all();

  return jsonResponse({
    ok: true,
    date,
    templatesForDay: templatesForDay.map((t) => ({ ...t, sessionExists: !!t.sessionId })),
    sessions,
  });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const date = body.date;
  if (!date || !isValidDate(date)) {
    return jsonResponse({ ok: false, error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 });
  }

  if (body.templateId) {
    const template = await context.env.DB.prepare('SELECT * FROM class_templates WHERE id = ?')
      .bind(body.templateId)
      .first();
    if (!template) {
      return jsonResponse({ ok: false, error: 'Template not found' }, { status: 404 });
    }

    const existing = await context.env.DB.prepare(
      'SELECT id FROM class_sessions WHERE template_id = ? AND session_date = ?'
    )
      .bind(body.templateId, date)
      .first();
    if (existing) {
      return jsonResponse({ ok: true, session: { id: existing.id, date, alreadyExisted: true } });
    }

    const id = crypto.randomUUID();
    await context.env.DB.prepare(
      `INSERT INTO class_sessions (id, session_date, name, start_time, end_time, template_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, date, template.name, template.start_time, template.end_time, template.id, context.data.user.id)
      .run();

    return jsonResponse({ ok: true, session: { id, date, name: template.name } });
  }

  // One-off session (e.g. an extra Friday class) -- no template.
  const name = (body.name || '').trim();
  if (!name) {
    return jsonResponse({ ok: false, error: 'name is required for a one-off session' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await context.env.DB.prepare(
    `INSERT INTO class_sessions (id, session_date, name, start_time, end_time, template_id, created_by)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  )
    .bind(id, date, name, body.startTime || null, body.endTime || null, context.data.user.id)
    .run();

  return jsonResponse({ ok: true, session: { id, date, name } });
}

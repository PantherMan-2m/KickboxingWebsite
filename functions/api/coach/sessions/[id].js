import { jsonResponse } from '../../_utils/auth.js';

export async function onRequestGet(context) {
  const { id } = context.params;

  const session = await context.env.DB.prepare(
    `SELECT id, session_date AS date, name, start_time AS startTime, end_time AS endTime, template_id AS templateId
     FROM class_sessions WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!session) {
    return jsonResponse({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  // Full active roster, left-joined with any attendance already recorded for this
  // session -- lets the UI pre-fill checkboxes when reopening a session to amend it.
  const { results: roster } = await context.env.DB.prepare(
    `SELECT u.id, u.name, u.email, a.status
     FROM users u
     LEFT JOIN attendance a ON a.session_id = ? AND a.user_id = u.id
     WHERE u.role = 'student' AND u.status = 'active'
     ORDER BY u.name COLLATE NOCASE`
  )
    .bind(id)
    .all();

  return jsonResponse({
    ok: true,
    session,
    roster: roster.map((r) => ({ ...r, status: r.status || 'absent' })),
  });
}

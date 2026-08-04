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

  // RSVPs are keyed to the weekly template + date, not this session row (students RSVP
  // before a coach ever creates the session) -- one-off sessions have no template, so
  // there's nothing to match and every row's `going` stays false.
  let goingIds = new Set();
  if (session.templateId) {
    const { results: rsvps } = await context.env.DB.prepare(
      `SELECT user_id FROM session_rsvps WHERE template_id = ? AND session_date = ?`
    )
      .bind(session.templateId, session.date)
      .all();
    goingIds = new Set(rsvps.map((r) => r.user_id));
  }

  return jsonResponse({
    ok: true,
    session,
    roster: roster.map((r) => ({ ...r, status: r.status || 'absent', going: goingIds.has(r.id) })),
  });
}

import { jsonResponse } from '../../_utils/auth.js';
import { parseJsonBody } from '../../_utils/body.js';
import { parseCapacity } from '../../_utils/capacity.js';

export async function onRequestGet(context) {
  const { id } = context.params;

  // Effective capacity: COALESCE(class_sessions.capacity, class_templates.capacity).
  // A one-off session (template_id NULL) has nothing to inherit, so the LEFT JOIN's
  // NULL template capacity coalesces to session.capacity either way.
  const session = await context.env.DB.prepare(
    `SELECT cs.id, cs.session_date AS date, cs.name, cs.start_time AS startTime, cs.end_time AS endTime,
            cs.template_id AS templateId, cs.capacity, ct.capacity AS templateCapacity
     FROM class_sessions cs
     LEFT JOIN class_templates ct ON ct.id = cs.template_id
     WHERE cs.id = ?`
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

  // `status: r.status || 'absent'` above collapses "no attendance row exists yet" and "a
  // row exists saying absent" into the same value -- the client can't tell a never-saved
  // session from a saved all-absent one from `status` alone. mark-attendance.js writes a
  // row for the *whole* roster, not only those present, so a non-zero count here is a
  // reliable "this session has been saved" signal for the client's pre-fill decision.
  const attendanceCount = await context.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?'
  )
    .bind(id)
    .first();

  return jsonResponse({
    ok: true,
    session: {
      id: session.id,
      date: session.date,
      name: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      templateId: session.templateId,
      capacity: session.capacity,
      effectiveCapacity: session.capacity !== null ? session.capacity : session.templateCapacity,
      attendanceSaved: attendanceCount.n > 0,
    },
    roster: roster.map((r) => ({ ...r, status: r.status || 'absent', going: goingIds.has(r.id) })),
  });
}

// The per-session capacity override -- created on the session's own page (see T2.2's
// amended note on why coach/attendance.html's bare "Create session" button has nowhere
// to put this field). Capacity-only: `active` doesn't apply to a class_sessions row.
export async function onRequestPatch(context) {
  const { id } = context.params;
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  if (!('capacity' in body)) {
    return jsonResponse({ ok: false, error: 'capacity is required' }, { status: 400 });
  }
  const capacityResult = parseCapacity(body.capacity);
  if (!capacityResult.ok) {
    return jsonResponse({ ok: false, error: capacityResult.error }, { status: 400 });
  }

  const result = await context.env.DB.prepare('UPDATE class_sessions SET capacity = ? WHERE id = ?')
    .bind(capacityResult.capacity, id)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}

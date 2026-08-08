import { jsonResponse } from '../../_utils/auth.js';
import { parseJsonBody } from '../../_utils/body.js';
import { parseCapacity } from '../../_utils/capacity.js';
import { promoteAndNotify } from '../../_utils/waitlist.js';
import { paymentStatusForRoster } from '../../_utils/payments.js';

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
  // there's nothing to match and every row's `going` stays false, and there's nobody
  // to waitlist either (fact 4).
  let goingIds = new Set();
  let waitlist = [];
  if (session.templateId) {
    const { results: rsvps } = await context.env.DB.prepare(
      `SELECT user_id FROM session_rsvps WHERE template_id = ? AND session_date = ? AND status = 'going'`
    )
      .bind(session.templateId, session.date)
      .all();
    goingIds = new Set(rsvps.map((r) => r.user_id));

    // Queue order (created_at, user_id) -- same ordering promoteWaitlist uses, so
    // this list is literally "who's promoted next" read top to bottom. Kept
    // separate from `roster` so the client can't confuse a waitlisted student
    // with someone to mark present.
    const { results: waitlistRows } = await context.env.DB.prepare(
      `SELECT u.id, u.name, u.email FROM session_rsvps r
       JOIN users u ON u.id = r.user_id
       WHERE r.template_id = ? AND r.session_date = ? AND r.status = 'waitlisted'
       ORDER BY r.created_at, r.user_id`
    )
      .bind(session.templateId, session.date)
      .all();
    waitlist = waitlistRows;
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

  // T4.6 (D4/D6): the overdue flag, applied to both lists -- the waitlist case is
  // the one Phase 3 flagged as newly reachable (an overdue member still waitlists
  // and is still promoted in strict queue order; see plan/phase-4.md). One batch
  // query for the whole page, not one per student.
  const allIds = [...roster.map((r) => r.id), ...waitlist.map((w) => w.id)];
  const paymentStatusMap = await paymentStatusForRoster(context.env.DB, allIds);

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
    roster: roster.map((r) => ({
      ...r,
      status: r.status || 'absent',
      going: goingIds.has(r.id),
      paymentStatus: paymentStatusMap.get(r.id) || 'none',
    })),
    waitlist: waitlist.map((w) => ({ ...w, paymentStatus: paymentStatusMap.get(w.id) || 'none' })),
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

  // RETURNING the row's template_id/session_date in the same statement (fact 6)
  // avoids a second SELECT to learn what to promote against -- a one-off
  // session (template_id NULL) has no RSVPs to promote (fact 4).
  const updated = await context.env.DB.prepare(
    'UPDATE class_sessions SET capacity = ? WHERE id = ? RETURNING template_id, session_date'
  )
    .bind(capacityResult.capacity, id)
    .first();

  if (!updated) {
    return jsonResponse({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  // T3.5 (D2): affects exactly this one date (unlike a template capacity
  // change). Safe to call unconditionally on any successful write, including a
  // lowered or unchanged capacity -- see the matching note in templates/[id].js.
  if (updated.template_id) {
    await promoteAndNotify(context, updated.template_id, updated.session_date);
  }

  return jsonResponse({ ok: true });
}

// T3.1: the single place that decides who gets promoted off a class's waitlist.
// Every other write path that can free or add a spot (RSVP cancel, capacity
// raised) calls this -- nobody reimplements the promotion query.
//
// The free-spot count and the promotion happen inside one UPDATE statement, the
// same discipline T2.3's atomic RSVP insert uses for the last-spot race -- two
// concurrent callers computing "how many spots are free" from a separate SELECT
// first could both see the same one free spot and both promote into it. This
// never demotes a `going` row back to `waitlisted`: it only ever sets
// `waitlisted` rows to `going`.
import { buildEvent, notifyCoach, notifyStudent } from './notify.js';
import { dayLabelFor } from './dates.js';

// COALESCE(class_sessions.capacity, class_templates.capacity) for this
// template+date -- the same effective-capacity rule T2.2/T2.3 use everywhere
// else. The session row may not exist yet.
async function effectiveCapacity(db, templateId, date) {
  const template = await db.prepare('SELECT capacity FROM class_templates WHERE id = ?').bind(templateId).first();
  const session = await db
    .prepare('SELECT capacity FROM class_sessions WHERE template_id = ? AND session_date = ?')
    .bind(templateId, date)
    .first();
  if (session && session.capacity !== null) return session.capacity;
  return template ? template.capacity : null;
}

// Promotes the oldest waitlisted students (created_at, then user_id for a
// deterministic tie-break within the same second) into whatever spots are
// free, and returns the promoted user_ids -- so a caller can notify them
// without a second read. Returns [] when the class is still full.
export async function promoteWaitlist(db, templateId, date) {
  const capacity = await effectiveCapacity(db, templateId, date);

  if (capacity === null) {
    const { results } = await db
      .prepare(
        `UPDATE session_rsvps SET status = 'going'
         WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'
         RETURNING user_id`
      )
      .bind(templateId, date)
      .all();
    return results.map((r) => r.user_id);
  }

  const { results } = await db
    .prepare(
      `UPDATE session_rsvps SET status = 'going'
       WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'
         AND user_id IN (
           SELECT user_id FROM session_rsvps
           WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'
           ORDER BY created_at, user_id
           LIMIT MAX(0, ? - (SELECT COUNT(*) FROM session_rsvps
                             WHERE template_id = ? AND session_date = ? AND status = 'going'))
         )
       RETURNING user_id`
    )
    .bind(templateId, date, templateId, date, capacity, templateId, date)
    .all();
  return results.map((r) => r.user_id);
}

// 1-indexed position in the queue (D3: shown position, not total queue length).
// Same created_at/user_id ordering promoteWaitlist uses, so "#1 in line" is
// always the next one promoteWaitlist would promote. Returns null if the user
// has no waitlisted row for this template+date.
export async function waitlistPosition(db, templateId, date, userId) {
  const target = await db
    .prepare(
      `SELECT created_at FROM session_rsvps
       WHERE template_id = ? AND session_date = ? AND user_id = ? AND status = 'waitlisted'`
    )
    .bind(templateId, date, userId)
    .first();
  if (!target) return null;

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM session_rsvps
       WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'
         AND (created_at < ? OR (created_at = ? AND user_id <= ?))`
    )
    .bind(templateId, date, target.created_at, target.created_at, userId)
    .first();
  return row.n;
}

// Total number of students currently waitlisted (D3: distinct from a single
// student's position) -- also doubles as "resulting queue length" for a
// waitlist_joined event, since a newly-joined row is not guaranteed to land
// last in a same-second tie, so it isn't safe to reuse waitlistPosition() for
// that number.
export async function waitlistCount(db, templateId, date) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM session_rsvps WHERE template_id = ? AND session_date = ? AND status = 'waitlisted'`)
    .bind(templateId, date)
    .first();
  return row.n;
}

// T3.4: promotes (T3.1's promoteWaitlist), then fires one waitlist_promoted
// event per promoted student -- to that student directly and to the coach.
// Every write path that can free or add a spot (RSVP cancel, T3.5's capacity
// raise) calls this rather than promoteWaitlist directly, so the notification
// never gets forgotten at a new call site. Returns the promoted user_ids, same
// as promoteWaitlist, so a caller can still branch on whether promotion
// happened (e.g. rsvp.js re-checking its own status).
export async function promoteAndNotify(context, templateId, date) {
  const promotedUserIds = await promoteWaitlist(context.env.DB, templateId, date);
  if (promotedUserIds.length === 0) return promotedUserIds;

  const template = await context.env.DB.prepare('SELECT name, start_time FROM class_templates WHERE id = ?')
    .bind(templateId)
    .first();
  const dayLabel = dayLabelFor(date);

  for (const userId of promotedUserIds) {
    const user = await context.env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(userId).first();
    const event = buildEvent('waitlist_promoted', {
      className: template.name,
      dayLabel,
      time: template.start_time,
      date,
      studentName: user.name,
      studentEmail: user.email,
    });
    notifyCoach(context.env, context, event);
    notifyStudent(context.env, context, user.email, event);
  }
  return promotedUserIds;
}

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

import { jsonResponse } from '../_utils/auth.js';
import { parseJsonBody } from '../_utils/body.js';
import { isValidDate, todayIso, addDaysIso, dayOfWeekFor, dayLabelFor, RSVP_WINDOW_DAYS } from '../_utils/dates.js';
import { promoteAndNotify, waitlistPosition, waitlistCount } from '../_utils/waitlist.js';
import { buildEvent, notifyCoach } from '../_utils/notify.js';

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
      'SELECT id, day_of_week, capacity, name, start_time FROM class_templates WHERE id = ? AND active = 1'
    )
      .bind(templateId)
      .first();
    if (!template) {
      return jsonResponse({ ok: false, error: 'Class not found' }, { status: 404 });
    }
    if (dayOfWeekFor(date) !== template.day_of_week) {
      return jsonResponse({ ok: false, error: 'Date does not match this class\'s weekday' }, { status: 400 });
    }

    // A student who already has a row (going or waitlisted) is never rejected --
    // re-RSVPing is idempotent from either status, and each gets its own response
    // shape. Deliberately unfiltered on status: this must find the row regardless
    // of which one it is.
    const existing = await context.env.DB.prepare(
      'SELECT status FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?'
    )
      .bind(templateId, date, context.data.user.id)
      .first();
    if (existing) {
      if (existing.status === 'waitlisted') {
        const position = await waitlistPosition(context.env.DB, templateId, date, context.data.user.id);
        return jsonResponse({ ok: true, status: 'waitlisted', position });
      }
      return jsonResponse({ ok: true, status: 'going' });
    }

    // Effective capacity: COALESCE(class_sessions.capacity, class_templates.capacity)
    // for this template+date. The class_sessions row may not exist yet -- coaches
    // create sessions on the day, after students have already been RSVPing.
    const session = await context.env.DB.prepare(
      'SELECT capacity FROM class_sessions WHERE template_id = ? AND session_date = ?'
    )
      .bind(templateId, date)
      .first();
    const effectiveCapacity = session && session.capacity !== null ? session.capacity : template.capacity;

    if (effectiveCapacity === null) {
      await context.env.DB.prepare(
        `INSERT INTO session_rsvps (template_id, session_date, user_id) VALUES (?, ?, ?)
         ON CONFLICT(template_id, session_date, user_id) DO NOTHING`
      )
        .bind(templateId, date, context.data.user.id)
        .run();
      return jsonResponse({ ok: true, status: 'going' });
    }

    // Atomic: the capacity check and the insert happen in one statement, so two
    // requests racing for the last spot cannot both succeed. A read-count-then-insert
    // would have a window between the two where both could pass the check.
    // ON CONFLICT DO NOTHING covers a double-submitted RSVP racing the "existing" check
    // above (two near-simultaneous requests from the same user, neither of which sees
    // the other's row yet) -- without it, the second insert would throw an uncaught
    // UNIQUE constraint error instead of a graceful response.
    const result = await context.env.DB.prepare(
      `INSERT INTO session_rsvps (template_id, session_date, user_id)
       SELECT ?, ?, ?
       WHERE (SELECT COUNT(*) FROM session_rsvps WHERE template_id = ? AND session_date = ? AND status = 'going') < ?
       ON CONFLICT (template_id, session_date, user_id) DO NOTHING`
    )
      .bind(templateId, date, context.data.user.id, templateId, date, effectiveCapacity)
      .run();

    if (result.meta.changes === 0) {
      // changes===0 is ambiguous on its own -- either the class was full (the WHERE
      // blocked the SELECT), or this exact row already exists (a double-submit racing
      // the "existing" check above, ON CONFLICT silently no-op'd). Both cases are
      // handled the same way below: try to waitlist (itself a no-op if the row already
      // exists, via the same ON CONFLICT DO NOTHING), then read back this user's own
      // row to answer from -- which tells the two cases apart without needing to.
      const waitlistInsert = await context.env.DB.prepare(
        `INSERT INTO session_rsvps (template_id, session_date, user_id, status) VALUES (?, ?, ?, 'waitlisted')
         ON CONFLICT (template_id, session_date, user_id) DO NOTHING`
      )
        .bind(templateId, date, context.data.user.id)
        .run();

      // Closes the window where a spot opened between the failed going-insert and
      // the waitlist insert just above -- normally promotes nobody. Run this
      // *before* deciding on waitlist_joined below: if this student ends up
      // promoted before that decision, they get a waitlist_promoted event
      // instead, never both.
      await promoteAndNotify(context, templateId, date);

      // The definitive check is this student's actual current status, not just
      // whether *this* promoteAndNotify call's own return value named them --
      // another concurrent write (e.g. a coach's capacity raise landing in the
      // same window) can free the spot and promote this student via its own
      // promoteAndNotify call instead, and that must be excluded here too.
      const finalRow = await context.env.DB.prepare(
        'SELECT status FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?'
      )
        .bind(templateId, date, context.data.user.id)
        .first();

      // changes===1 means a genuinely new waitlisted row was created (not a
      // double-submit no-op), and finalRow confirms this student is still
      // waitlisted -- if they were promoted above, waitlist_joined would be a
      // duplicate notification (they already got waitlist_promoted instead).
      if (waitlistInsert.meta.changes === 1 && finalRow.status === 'waitlisted') {
        const queueLength = await waitlistCount(context.env.DB, templateId, date);
        const event = buildEvent('waitlist_joined', {
          className: template.name,
          dayLabel: dayLabelFor(date),
          time: template.start_time,
          date,
          studentName: context.data.user.name,
          queueLength,
        });
        notifyCoach(context.env, context, event);
      }

      if (finalRow.status === 'going') {
        return jsonResponse({ ok: true, status: 'going' });
      }
      const position = await waitlistPosition(context.env.DB, templateId, date, context.data.user.id);
      return jsonResponse({ ok: true, status: 'waitlisted', position });
    }
    return jsonResponse({ ok: true, status: 'going' });
  }

  // Cancellation. Deliberately unfiltered on status: a waitlisted student leaving
  // the queue must delete their row too, not only a going student cancelling.
  // RETURNING status in one statement (no read-then-delete race) tells us whether
  // a spot was actually freed -- promotion only makes sense for a going row;
  // a waitlisted student cancelling frees nothing to promote into.
  const deleted = await context.env.DB.prepare(
    `DELETE FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ? RETURNING status`
  )
    .bind(templateId, date, context.data.user.id)
    .first();
  if (deleted && deleted.status === 'going') {
    await promoteAndNotify(context, templateId, date);
  }

  return jsonResponse({ ok: true });
}

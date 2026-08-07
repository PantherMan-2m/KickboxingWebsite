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
      'SELECT id, day_of_week, capacity FROM class_templates WHERE id = ? AND active = 1'
    )
      .bind(templateId)
      .first();
    if (!template) {
      return jsonResponse({ ok: false, error: 'Class not found' }, { status: 404 });
    }
    if (dayOfWeekFor(date) !== template.day_of_week) {
      return jsonResponse({ ok: false, error: 'Date does not match this class\'s weekday' }, { status: 400 });
    }

    // A student who already has a row is never rejected by capacity -- a full class
    // must not break the idempotent re-RSVP the ON CONFLICT ... DO NOTHING below relies on.
    // Deliberately unfiltered on status: this must find the row whether it's going or
    // waitlisted, since the two need different responses (T3.2).
    const existing = await context.env.DB.prepare(
      'SELECT 1 FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?'
    )
      .bind(templateId, date, context.data.user.id)
      .first();
    if (existing) {
      return jsonResponse({ ok: true });
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
    } else {
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
        // Ambiguous on its own: either the class was full (the WHERE blocked the SELECT),
        // or this exact row already existed (ON CONFLICT silently no-op'd). Re-query for
        // this user's own row to tell the two apart. Deliberately unfiltered on status --
        // this branch is about to insert a waitlisted row itself (T3.2), so it must find
        // any pre-existing row regardless of status.
        const stillExists = await context.env.DB.prepare(
          'SELECT 1 FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?'
        )
          .bind(templateId, date, context.data.user.id)
          .first();
        if (!stillExists) {
          return jsonResponse({ ok: false, error: 'This class is full' }, { status: 409 });
        }
      }
    }
  } else {
    // Deliberately unfiltered on status: a waitlisted student leaving the queue must
    // delete their row too, not only a going student cancelling (T3.2).
    await context.env.DB.prepare(
      `DELETE FROM session_rsvps WHERE template_id = ? AND session_date = ? AND user_id = ?`
    )
      .bind(templateId, date, context.data.user.id)
      .run();
  }

  return jsonResponse({ ok: true });
}

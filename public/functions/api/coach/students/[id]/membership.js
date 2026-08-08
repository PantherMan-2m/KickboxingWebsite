import { jsonResponse } from '../../../_utils/auth.js';
import { parseJsonBody } from '../../../_utils/body.js';
import { isValidDate, addDaysIso } from '../../../_utils/dates.js';

// Sibling file to students/[id].js (rather than folding this into that PATCH) --
// assigning a plan is a different operation with its own validation surface
// (D2's period guard, the family-discount override) and keeping it separate
// keeps students/[id].js's own PATCH (active/inactive) readable.
export async function onRequestPost(context) {
  const { id: userId } = context.params;
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  const planId = body.plan_id;
  const startDate = body.start_date;
  if (typeof planId !== 'string' || !planId) {
    return jsonResponse({ ok: false, error: 'plan_id is required' }, { status: 400 });
  }
  if (!isValidDate(startDate)) {
    return jsonResponse({ ok: false, error: 'start_date must be a valid date' }, { status: 400 });
  }

  let overrideCents = null;
  if ('price_override_cents' in body && body.price_override_cents !== null && body.price_override_cents !== undefined) {
    const value = body.price_override_cents;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return jsonResponse({ ok: false, error: 'price_override_cents must be a non-negative whole number, or null' }, { status: 400 });
    }
    overrideCents = value;
  }

  const student = await context.env.DB.prepare(`SELECT id FROM users WHERE id = ? AND role = 'student'`)
    .bind(userId)
    .first();
  if (!student) {
    return jsonResponse({ ok: false, error: 'Student not found' }, { status: 404 });
  }

  const plan = await context.env.DB.prepare('SELECT id, period FROM membership_plans WHERE id = ?')
    .bind(planId)
    .first();
  if (!plan) {
    return jsonResponse({ ok: false, error: 'Plan not found' }, { status: 404 });
  }
  // D2: Drop-in (period='session') exists so a payment can reference it, but it
  // never backs a membership -- a drop-in student is "no plan", never "overdue".
  if (plan.period !== 'month') {
    return jsonResponse({ ok: false, error: 'Only a month plan can back a membership' }, { status: 400 });
  }

  // A student has at most one open (end_date IS NULL) membership at a time --
  // close it to the day before the new one starts, in the same request as the
  // insert, so there is never a window with two open rows.
  const dayBeforeStart = addDaysIso(startDate, -1);
  await context.env.DB.prepare(`UPDATE memberships SET end_date = ? WHERE user_id = ? AND end_date IS NULL`)
    .bind(dayBeforeStart, userId)
    .run();

  const id = crypto.randomUUID();
  await context.env.DB.prepare(
    `INSERT INTO memberships (id, user_id, plan_id, start_date, price_override_cents, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, userId, planId, startDate, overrideCents, context.data.user.id)
    .run();

  return jsonResponse({
    ok: true,
    membership: { id, userId, planId, startDate, priceOverrideCents: overrideCents },
  });
}

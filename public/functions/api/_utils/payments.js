// Phase 4: the whole "is this member paid up" rule, in one place. D4/D6 (plan/phase-4.md).
import { addDaysIso, todayIso } from './dates.js';

// A member has until the 7th of the month to pay for that month. Hardcoded and
// named on purpose (D5) -- not an env var, not a settings row.
export const PAYMENT_GRACE_DAYS = 7;

// D3: the family discount is a nullable per-membership override; COALESCE to the
// plan's own price when unset. Same override idiom as effective capacity
// (COALESCE(class_sessions.capacity, class_templates.capacity)) -- one pattern,
// not two. `membership` is a joined row carrying both prices under these names.
export function effectivePriceCents(membership) {
  const { priceOverrideCents, planPriceCents } = membership;
  return priceOverrideCents === null || priceOverrideCents === undefined ? planPriceCents : priceOverrideCents;
}

// D4: overdue is computed here, never stored. For each user id:
//   effective_paid_through = COALESCE(MAX(payments.covers_end), date(membership.start_date, '-1 day'))
//   overdue                = effective_paid_through < date(today, '-PAYMENT_GRACE_DAYS days')
// The COALESCE fallback (the day *before* the membership started) is what keeps a
// brand-new, not-yet-paid member from reading as overdue on day one, while a member
// who joined months ago and never paid does.
//
// D6: three states, not two -- 'none' means "no active membership" (never enrolled,
// drop-in only, or a membership that has ended), and is deliberately distinct from
// 'overdue' so a drop-in/brand-new student doesn't paint red.
//
// One query for the whole roster, whatever its size (T4.2/T4.6) -- a correlated
// subquery finds each active-membership user's latest payment inline, rather than a
// second grouped query or a per-student loop. `today` is an optional override so
// tests can pin both sides of the grace-day boundary without waiting on the clock.
export async function paymentStatusForRoster(db, userIds, today = todayIso()) {
  const statusMap = new Map();
  for (const id of userIds) statusMap.set(id, 'none');
  if (userIds.length === 0) return statusMap;

  const placeholders = userIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT m.user_id AS userId, m.start_date AS startDate,
              (SELECT MAX(p.covers_end) FROM payments p WHERE p.user_id = m.user_id) AS maxCoversEnd
       FROM memberships m
       WHERE m.user_id IN (${placeholders}) AND m.end_date IS NULL`
    )
    .bind(...userIds)
    .all();

  const threshold = addDaysIso(today, -PAYMENT_GRACE_DAYS);
  for (const row of results) {
    const effectivePaidThrough = row.maxCoversEnd ?? addDaysIso(row.startDate, -1);
    statusMap.set(row.userId, effectivePaidThrough < threshold ? 'overdue' : 'paid');
  }
  return statusMap;
}

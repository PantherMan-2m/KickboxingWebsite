import { jsonResponse } from '../_utils/auth.js';
import { paymentStatusForRoster, effectivePriceCents } from '../_utils/payments.js';

// Read-only, own records only. The user id comes exclusively from the session
// (context.data.user.id, set by student/_middleware.js) -- this handler never
// reads a userId from the query string or body, so there is no parameter here
// an IDOR attempt could even supply.
export async function onRequestGet(context) {
  const userId = context.data.user.id;

  const membership = await context.env.DB.prepare(
    `SELECT m.price_override_cents AS priceOverrideCents,
            mp.id AS planId, mp.name AS planName, mp.price_cents AS planPriceCents
     FROM memberships m
     JOIN membership_plans mp ON mp.id = m.plan_id
     WHERE m.user_id = ? AND m.end_date IS NULL`
  )
    .bind(userId)
    .first();

  // History shown to the student is capped to the 3 most recent -- older rows never
  // leave the server. The status query below is deliberately separate and unlimited:
  // paymentStatusForRoster's MAX(covers_end) must see every payment, or a student with
  // 4+ payments could read 'overdue' via a stale-looking recent payment while an older
  // one (outside this LIMIT) actually still covers them. Do not consolidate these two
  // queries.
  const { results: payments } = await context.env.DB.prepare(
    `SELECT p.id, p.amount_cents AS amountCents, p.method, p.paid_on AS paidOn,
            p.covers_start AS coversStart, p.covers_end AS coversEnd, p.note, mp.name AS planName
     FROM payments p
     LEFT JOIN membership_plans mp ON mp.id = p.plan_id
     WHERE p.user_id = ? ORDER BY p.paid_on DESC, p.created_at DESC LIMIT 3`
  )
    .bind(userId)
    .all();

  const statusMap = await paymentStatusForRoster(context.env.DB, [userId]);

  return jsonResponse({
    ok: true,
    plan: membership
      ? { id: membership.planId, name: membership.planName, effectivePriceCents: effectivePriceCents(membership) }
      : null,
    status: statusMap.get(userId) || 'none',
    payments,
  });
}

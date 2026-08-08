import { jsonResponse } from '../_utils/auth.js';
import { parseJsonBody } from '../_utils/body.js';
import { parsePriceCents, parseAllowance, parsePeriod } from '../_utils/plans.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, name, price_cents AS priceCents, allowance_per_period AS allowancePerPeriod, period, active
     FROM membership_plans ORDER BY price_cents`
  ).all();
  return jsonResponse({ ok: true, plans: results });
}

export async function onRequestPost(context) {
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  const name = (body.name || '').trim();
  if (!name) {
    return jsonResponse({ ok: false, error: 'name is required' }, { status: 400 });
  }

  const priceResult = parsePriceCents(body.price_cents);
  if (!priceResult.ok) {
    return jsonResponse({ ok: false, error: priceResult.error }, { status: 400 });
  }

  const allowanceResult = parseAllowance(body.allowance_per_period ?? null);
  if (!allowanceResult.ok) {
    return jsonResponse({ ok: false, error: allowanceResult.error }, { status: 400 });
  }

  const periodResult = parsePeriod(body.period);
  if (!periodResult.ok) {
    return jsonResponse({ ok: false, error: periodResult.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await context.env.DB.prepare(
    `INSERT INTO membership_plans (id, name, price_cents, allowance_per_period, period) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, name, priceResult.priceCents, allowanceResult.allowance, periodResult.period)
    .run();

  return jsonResponse({
    ok: true,
    plan: {
      id,
      name,
      priceCents: priceResult.priceCents,
      allowancePerPeriod: allowanceResult.allowance,
      period: periodResult.period,
      active: 1,
    },
  });
}

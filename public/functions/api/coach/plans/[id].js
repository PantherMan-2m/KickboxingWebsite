import { jsonResponse } from '../../_utils/auth.js';
import { parseJsonBody } from '../../_utils/body.js';
import { parsePriceCents, parseAllowance } from '../../_utils/plans.js';

// Partial update, following templates/[id].js's established shape: apply whichever
// of name/price_cents/allowance_per_period/active are present, reject a body with
// none of them. `period` is immutable once a plan exists (D2) -- changing it could
// orphan live memberships -- so it is rejected outright rather than silently ignored.
export async function onRequestPatch(context) {
  const { id } = context.params;
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  if ('period' in body) {
    return jsonResponse({ ok: false, error: 'period cannot be changed once a plan exists' }, { status: 400 });
  }

  const hasName = 'name' in body;
  const hasPrice = 'price_cents' in body;
  const hasAllowance = 'allowance_per_period' in body;
  const hasActive = 'active' in body;
  if (!hasName && !hasPrice && !hasAllowance && !hasActive) {
    return jsonResponse({ ok: false, error: 'at least one of name, price_cents, allowance_per_period, active is required' }, { status: 400 });
  }

  const sets = [];
  const binds = [];

  if (hasName) {
    // Finding 3a (review triage): same (body.name || '').trim() bug as plans.js's POST --
    // a non-string, truthy name crashed .trim() with a bare 500 instead of a 400.
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return jsonResponse({ ok: false, error: 'name cannot be empty' }, { status: 400 });
    }
    const name = body.name.trim();
    sets.push('name = ?');
    binds.push(name);
  }
  if (hasPrice) {
    const priceResult = parsePriceCents(body.price_cents);
    if (!priceResult.ok) {
      return jsonResponse({ ok: false, error: priceResult.error }, { status: 400 });
    }
    sets.push('price_cents = ?');
    binds.push(priceResult.priceCents);
  }
  if (hasAllowance) {
    const allowanceResult = parseAllowance(body.allowance_per_period);
    if (!allowanceResult.ok) {
      return jsonResponse({ ok: false, error: allowanceResult.error }, { status: 400 });
    }
    sets.push('allowance_per_period = ?');
    binds.push(allowanceResult.allowance);
  }
  if (hasActive) {
    if (typeof body.active !== 'boolean') {
      return jsonResponse({ ok: false, error: 'active must be a boolean' }, { status: 400 });
    }
    sets.push('active = ?');
    binds.push(body.active ? 1 : 0);
  }
  sets.push('updated_at = CURRENT_TIMESTAMP');
  binds.push(id);

  const result = await context.env.DB.prepare(`UPDATE membership_plans SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ ok: false, error: 'Plan not found' }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}

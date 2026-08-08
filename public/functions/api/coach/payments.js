import { jsonResponse } from '../_utils/auth.js';
import { parseJsonBody } from '../_utils/body.js';
import { isValidDate } from '../_utils/dates.js';

// GET ?userId=<id> filters to one student's ledger; omitted returns everyone's,
// most recent first -- the coach page shows both.
export async function onRequestGet(context) {
  const userId = new URL(context.request.url).searchParams.get('userId');

  const base = `SELECT p.id, p.user_id AS userId, u.name AS userName, p.plan_id AS planId, mp.name AS planName,
                       p.amount_cents AS amountCents, p.method, p.paid_on AS paidOn,
                       p.covers_start AS coversStart, p.covers_end AS coversEnd, p.note,
                       p.recorded_by AS recordedBy, p.created_at AS createdAt
                FROM payments p
                JOIN users u ON u.id = p.user_id
                LEFT JOIN membership_plans mp ON mp.id = p.plan_id`;

  const { results } = userId
    ? await context.env.DB.prepare(`${base} WHERE p.user_id = ? ORDER BY p.paid_on DESC, p.created_at DESC`).bind(userId).all()
    : await context.env.DB.prepare(`${base} ORDER BY p.paid_on DESC, p.created_at DESC`).all();

  return jsonResponse({ ok: true, payments: results });
}

export async function onRequestPost(context) {
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  const userId = body.user_id;
  if (typeof userId !== 'string' || !userId) {
    return jsonResponse({ ok: false, error: 'user_id is required' }, { status: 400 });
  }

  const amountCents = body.amount_cents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return jsonResponse({ ok: false, error: 'amount_cents must be a positive whole number of cents' }, { status: 400 });
  }

  if (body.method !== 'cash' && body.method !== 'eft') {
    return jsonResponse({ ok: false, error: "method must be 'cash' or 'eft'" }, { status: 400 });
  }

  const paidOn = body.paid_on;
  const coversStart = body.covers_start;
  const coversEnd = body.covers_end;
  if (!isValidDate(paidOn) || !isValidDate(coversStart) || !isValidDate(coversEnd)) {
    return jsonResponse({ ok: false, error: 'paid_on, covers_start, and covers_end must each be a valid date' }, { status: 400 });
  }
  if (coversEnd < coversStart) {
    return jsonResponse({ ok: false, error: 'covers_end must not be before covers_start' }, { status: 400 });
  }

  const student = await context.env.DB.prepare(`SELECT id FROM users WHERE id = ? AND role = 'student'`)
    .bind(userId)
    .first();
  if (!student) {
    return jsonResponse({ ok: false, error: 'Student not found' }, { status: 404 });
  }

  let planId = null;
  if ('plan_id' in body && body.plan_id !== null) {
    if (typeof body.plan_id !== 'string') {
      return jsonResponse({ ok: false, error: 'plan_id must be a string, or null' }, { status: 400 });
    }
    const plan = await context.env.DB.prepare('SELECT id FROM membership_plans WHERE id = ?').bind(body.plan_id).first();
    if (!plan) {
      return jsonResponse({ ok: false, error: 'Plan not found' }, { status: 404 });
    }
    planId = body.plan_id;
  }

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  const id = crypto.randomUUID();
  // recorded_by always comes from the session, never the request body -- a coach
  // cannot attribute a payment record to anyone but themselves.
  await context.env.DB.prepare(
    `INSERT INTO payments (id, user_id, plan_id, amount_cents, method, paid_on, covers_start, covers_end, note, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, userId, planId, amountCents, body.method, paidOn, coversStart, coversEnd, note, context.data.user.id)
    .run();

  return jsonResponse({
    ok: true,
    payment: { id, userId, planId, amountCents, method: body.method, paidOn, coversStart, coversEnd, note, recordedBy: context.data.user.id },
  });
}

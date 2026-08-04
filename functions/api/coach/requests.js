import { jsonResponse } from '../_utils/auth.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, email, name, created_at FROM users WHERE status = 'pending' ORDER BY created_at`
  ).all();
  return jsonResponse({ ok: true, requests: results });
}

import { jsonResponse } from '../_utils/auth.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT cs.session_date AS date, cs.name, a.status
     FROM attendance a
     JOIN class_sessions cs ON cs.id = a.session_id
     WHERE a.user_id = ?
     ORDER BY cs.session_date DESC`
  )
    .bind(context.data.user.id)
    .all();

  return jsonResponse({ ok: true, attendance: results });
}

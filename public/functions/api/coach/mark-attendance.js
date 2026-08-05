import { jsonResponse } from '../_utils/auth.js';

const VALID_STATUSES = ['present', 'absent', 'excused'];

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const { sessionId, records } = body;
  if (!sessionId || !Array.isArray(records) || records.length === 0) {
    return jsonResponse({ ok: false, error: 'sessionId and a non-empty records array are required' }, { status: 400 });
  }
  for (const r of records) {
    if (!r.userId || !VALID_STATUSES.includes(r.status)) {
      return jsonResponse({ ok: false, error: 'Each record needs a userId and a valid status' }, { status: 400 });
    }
  }

  const session = await context.env.DB.prepare('SELECT id FROM class_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  if (!session) {
    return jsonResponse({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  const stmt = context.env.DB.prepare(
    `INSERT INTO attendance (session_id, user_id, status, marked_by, marked_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(session_id, user_id) DO UPDATE SET
       status = excluded.status, marked_by = excluded.marked_by, marked_at = CURRENT_TIMESTAMP`
  );

  // env.DB.batch() runs every statement as a single all-or-nothing transaction, so the
  // whole roster is saved atomically -- no risk of a partial save if one row fails.
  await context.env.DB.batch(
    records.map((r) => stmt.bind(sessionId, r.userId, r.status, context.data.user.id))
  );

  return jsonResponse({ ok: true });
}

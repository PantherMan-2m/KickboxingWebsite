import { jsonResponse } from '../../_utils/auth.js';

export async function onRequestPatch(context) {
  const { id } = context.params;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  if (!['active', 'inactive'].includes(body.status)) {
    return jsonResponse({ ok: false, error: 'status must be active or inactive' }, { status: 400 });
  }

  const result = await context.env.DB.prepare(
    `UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'student'`
  )
    .bind(body.status, id)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ ok: false, error: 'Student not found' }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}

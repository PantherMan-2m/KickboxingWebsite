import { jsonResponse } from '../../_utils/auth.js';
import { parseJsonBody } from '../../_utils/body.js';

export async function onRequestPatch(context) {
  const { id } = context.params;
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

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

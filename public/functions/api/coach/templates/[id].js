import { jsonResponse } from '../../_utils/auth.js';
import { parseJsonBody } from '../../_utils/body.js';

export async function onRequestPatch(context) {
  const { id } = context.params;
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  if (typeof body.active !== 'boolean') {
    return jsonResponse({ ok: false, error: 'active must be a boolean' }, { status: 400 });
  }

  const result = await context.env.DB.prepare('UPDATE class_templates SET active = ? WHERE id = ?')
    .bind(body.active ? 1 : 0, id)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ ok: false, error: 'Template not found' }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}

import { jsonResponse } from '../../_utils/auth.js';

export async function onRequestPatch(context) {
  const { id } = context.params;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

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

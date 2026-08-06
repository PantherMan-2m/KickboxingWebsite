import { jsonResponse } from '../../_utils/auth.js';
import { parseJsonBody } from '../../_utils/body.js';
import { parseCapacity } from '../../_utils/capacity.js';

// Partial update: apply `active` and/or `capacity` when present in the body, reject a
// body containing neither. Distinguishing "field absent" (don't touch) from "field
// present as null/empty" (capacity: clear to unlimited) is why this checks `in body`
// rather than just testing truthiness.
export async function onRequestPatch(context) {
  const { id } = context.params;
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  const hasActive = 'active' in body;
  const hasCapacity = 'capacity' in body;
  if (!hasActive && !hasCapacity) {
    return jsonResponse({ ok: false, error: 'active and/or capacity is required' }, { status: 400 });
  }
  if (hasActive && typeof body.active !== 'boolean') {
    return jsonResponse({ ok: false, error: 'active must be a boolean' }, { status: 400 });
  }

  let capacity;
  if (hasCapacity) {
    const capacityResult = parseCapacity(body.capacity);
    if (!capacityResult.ok) {
      return jsonResponse({ ok: false, error: capacityResult.error }, { status: 400 });
    }
    capacity = capacityResult.capacity;
  }

  const sets = [];
  const binds = [];
  if (hasActive) {
    sets.push('active = ?');
    binds.push(body.active ? 1 : 0);
  }
  if (hasCapacity) {
    sets.push('capacity = ?');
    binds.push(capacity);
  }
  binds.push(id);

  const result = await context.env.DB.prepare(`UPDATE class_templates SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ ok: false, error: 'Template not found' }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}

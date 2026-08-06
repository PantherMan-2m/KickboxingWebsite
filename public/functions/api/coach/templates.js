import { jsonResponse } from '../_utils/auth.js';
import { parseJsonBody } from '../_utils/body.js';
import { parseCapacity } from '../_utils/capacity.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, day_of_week, start_time, end_time, name, active, capacity
     FROM class_templates WHERE active = 1 ORDER BY day_of_week, start_time`
  ).all();
  return jsonResponse({ ok: true, templates: results });
}

export async function onRequestPost(context) {
  const parsed = await parseJsonBody(context);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }
  const body = parsed.body;

  const dayOfWeek = Number(body.dayOfWeek);
  const startTime = (body.startTime || '').trim();
  const name = (body.name || '').trim();
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime || !name) {
    return jsonResponse({ ok: false, error: 'dayOfWeek (0-6), startTime, and name are required' }, { status: 400 });
  }

  const capacityResult = parseCapacity(body.capacity);
  if (!capacityResult.ok) {
    return jsonResponse({ ok: false, error: capacityResult.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await context.env.DB.prepare(
    `INSERT INTO class_templates (id, day_of_week, start_time, end_time, name, capacity) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, dayOfWeek, startTime, body.endTime || null, name, capacityResult.capacity)
    .run();

  return jsonResponse({
    ok: true,
    template: { id, dayOfWeek, startTime, endTime: body.endTime || null, name, capacity: capacityResult.capacity },
  });
}

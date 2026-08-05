import { getSessionUser, hashPassword, jsonResponse } from '../_utils/auth.js';

export async function onRequestPost(context) {
  const session = await getSessionUser(context);
  if (!session) {
    return jsonResponse({ ok: false, error: 'Not logged in' }, { status: 401 });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const newPassword = body.newPassword || '';
  if (newPassword.length < 8) {
    return jsonResponse({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await context.env.DB.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(passwordHash, session.user.id)
    .run();

  return jsonResponse({ ok: true, user: { role: session.user.role } });
}

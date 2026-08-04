import { hashPassword, generateTempPassword, jsonResponse } from '../_utils/auth.js';

// Public endpoint -- no session required. Always returns the same generic success
// message regardless of whether the email already has an account, to avoid letting an
// unauthenticated caller enumerate which emails are registered.
export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const email = (body.email || '').trim();
  const name = (body.name || '').trim();
  if (!email || !name) {
    return jsonResponse({ ok: false, error: 'Name and email are required' }, { status: 400 });
  }

  const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();

  if (!existing) {
    // Placeholder hash -- nobody knows this password, and login is already blocked for
    // any non-'active' account, so it's never actually usable. Overwritten with a real
    // temp password when a coach approves the request.
    const placeholderHash = await hashPassword(generateTempPassword());
    const id = crypto.randomUUID();

    await context.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password)
       VALUES (?, ?, ?, ?, 'student', 'pending', 1)`
    )
      .bind(id, email, placeholderHash, name)
      .run();
  }

  return jsonResponse({ ok: true });
}

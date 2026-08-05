import {
  verifyPassword,
  createSession,
  sessionCookieHeader,
  isLockedOut,
  recordFailedLogin,
  recordSuccessfulLogin,
  jsonResponse,
} from '../_utils/auth.js';

const GENERIC_ERROR = 'Invalid email or password';

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const email = (body.email || '').trim();
  const password = body.password || '';
  if (!email || !password) {
    return jsonResponse({ ok: false, error: GENERIC_ERROR }, { status: 401 });
  }

  const user = await context.env.DB.prepare(
    `SELECT id, email, password_hash, name, role, status, must_change_password,
            failed_login_attempts, locked_until
     FROM users WHERE email = ?`
  )
    .bind(email)
    .first();

  if (!user) {
    return jsonResponse({ ok: false, error: GENERIC_ERROR }, { status: 401 });
  }

  if (await isLockedOut(context.env, user)) {
    return jsonResponse({ ok: false, error: GENERIC_ERROR }, { status: 401 });
  }

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    await recordFailedLogin(context.env, user.id, user.failed_login_attempts);
    return jsonResponse({ ok: false, error: GENERIC_ERROR }, { status: 401 });
  }

  if (user.status !== 'active') {
    return jsonResponse({ ok: false, error: GENERIC_ERROR }, { status: 401 });
  }

  await recordSuccessfulLogin(context.env, user.id);
  const session = await createSession(context.env, user.id);

  return jsonResponse(
    {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        mustChangePassword: !!user.must_change_password,
      },
    },
    { headers: { 'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt) } }
  );
}

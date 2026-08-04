import { getSessionUser, jsonResponse } from '../_utils/auth.js';

export async function onRequest(context) {
  const session = await getSessionUser(context);
  if (!session) {
    return jsonResponse({ ok: false, error: 'Not logged in' }, { status: 401 });
  }
  if (session.user.role !== 'student') {
    return jsonResponse({ ok: false, error: 'Forbidden' }, { status: 403 });
  }
  if (session.user.mustChangePassword) {
    return jsonResponse({ ok: false, error: 'Password change required' }, { status: 403 });
  }
  context.data.user = session.user;
  return context.next();
}

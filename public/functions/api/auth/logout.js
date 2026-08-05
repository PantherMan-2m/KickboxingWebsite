import { getSessionUser, revokeSession, clearSessionCookieHeader, jsonResponse } from '../_utils/auth.js';

export async function onRequestPost(context) {
  const session = await getSessionUser(context);
  if (session) {
    await revokeSession(context.env, session.sessionId);
  }
  return jsonResponse({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}

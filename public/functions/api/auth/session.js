import { getSessionUser, jsonResponse } from '../_utils/auth.js';

// Public by construction (see functions/api/_middleware.js -- there is none;
// middleware only exists under api/coach/ and api/student/). Callable by
// anonymous visitors, so a logged-out result must not look like an error:
// always 200, never a 401 or redirect, or the homepage's console looks
// broken to every anonymous visitor who opens devtools.
export async function onRequestGet(context) {
  const session = await getSessionUser(context);
  if (!session) {
    return jsonResponse({ ok: true, user: null });
  }
  // Whitelist explicitly -- do not spread session.user, which also carries
  // id, email, and mustChangePassword. Only name + role are safe to expose
  // to an unauthenticated caller.
  return jsonResponse({ ok: true, user: { name: session.user.name, role: session.user.role } });
}

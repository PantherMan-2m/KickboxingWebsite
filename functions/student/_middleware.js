import { getSessionUser } from '../api/_utils/auth.js';

export async function onRequest(context) {
  const session = await getSessionUser(context);
  if (!session) {
    return Response.redirect(new URL('/login.html', context.request.url), 302);
  }
  if (session.user.role !== 'student') {
    return Response.redirect(new URL('/coach/dashboard.html', context.request.url), 302);
  }
  if (session.user.mustChangePassword) {
    return Response.redirect(new URL('/change-password.html', context.request.url), 302);
  }
  context.data.user = session.user;
  return context.next();
}

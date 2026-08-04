// TEMPORARY — Stage A infra verification only. Real role-based auth middleware
// replaces this in Stage B. This version only proves that middleware placed under
// functions/coach/ actually intercepts requests for static files under /coach/*
// (not just Pages Function routes), and that context.next() correctly falls through
// to serving the static asset when allowed.
//
// Visit /coach/smoke-test.html directly -> should be blocked (403, plain text).
// Visit /coach/smoke-test.html?bypass=1 -> should fall through and serve the real file.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get('bypass') === '1') {
    return context.next();
  }
  return new Response('blocked by middleware', { status: 403 });
}

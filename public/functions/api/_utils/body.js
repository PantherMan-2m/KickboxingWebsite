// Shared JSON body parsing for Pages Functions. `context.request.json()` throws on
// malformed JSON, but a literal `null` (or a bare string/number) parses successfully
// without throwing -- callers that destructure the result straight away would then
// throw an *uncaught* TypeError, producing a bare 500 instead of a graceful 400. This
// centralizes both checks; the caller decides the response shape.
export async function parseJsonBody(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return { ok: false, body: null };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, body: null };
  }
  return { ok: true, body };
}

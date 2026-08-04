// TEMPORARY — Stage A infra verification only. Confirms three things before the real
// auth build starts: (1) sibling-file imports from api/_utils work in deployed Pages
// Functions, (2) the D1 binding named `DB` is wired up correctly, (3) how long a
// PBKDF2 hash actually takes on this project's Workers CPU-time budget.
// Delete this file (and coach/smoke-test.html + functions/coach/_middleware.js's test
// version) once Stage A is verified — see plans/greedy-sprouting-honey.md.
import { hashPassword } from './_utils/auth.js';

export async function onRequestGet(context) {
  const result = { importWorked: true };

  const start = Date.now();
  await hashPassword('smoke-test-password');
  result.pbkdf2Ms = Date.now() - start;

  try {
    const row = await context.env.DB.prepare('SELECT 1 AS ok').first();
    result.dbBindingWorked = row?.ok === 1;
  } catch (err) {
    result.dbBindingWorked = false;
    result.dbError = String(err);
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

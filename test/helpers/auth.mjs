// Shared login helper for integration tests. Previously each of the 4
// integration test files defined its own near-identical copy of this.
//
// Returns the raw Response plus the extracted session cookie (if any) --
// callers read the body themselves via res.json()/res.text() as needed,
// since reading headers doesn't consume the body stream.

import { BASE_URL } from './server.mjs';

export async function login(email, password) {
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : null;
  return { res, cookie };
}

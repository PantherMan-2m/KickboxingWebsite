import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetAndSeed, startServer, stopServer } from '../helpers/server.mjs';
import { login } from '../helpers/auth.mjs';

// Uses lockout1@seed.test exclusively -- reserved in the seed data specifically
// so this test can lock the account without affecting any other test.
const EMAIL = 'lockout1@seed.test';
const CORRECT_PASSWORD = 'LockoutPass123!';

before(async () => {
  resetAndSeed();
  await startServer();
});

after(() => {
  stopServer();
});

test('5 consecutive failed logins lock the account, and a correct password is still rejected during the lock window', async () => {
  for (let i = 0; i < 5; i++) {
    const { res } = await login(EMAIL, 'WrongPassword' + i);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
  }

  // Account should now be locked -- even the correct password is rejected.
  const { res } = await login(EMAIL, CORRECT_PASSWORD);
  assert.equal(res.status, 401, 'expected the correct password to still be rejected while locked');
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'Invalid email or password', 'lockout must not leak a distinct error message');
});

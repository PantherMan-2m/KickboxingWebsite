import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, generateTempPassword } from '../../public/functions/api/_utils/auth.js';

test('hashPassword/verifyPassword round-trip succeeds for the correct password', async () => {
  const hash = await hashPassword('CorrectHorseBattery1');
  assert.equal(await verifyPassword('CorrectHorseBattery1', hash), true);
});

test('verifyPassword rejects an incorrect password', async () => {
  const hash = await hashPassword('CorrectHorseBattery1');
  assert.equal(await verifyPassword('WrongPassword', hash), false);
});

test('hashPassword produces a different salt (and hash) each call', async () => {
  const a = await hashPassword('SamePassword1');
  const b = await hashPassword('SamePassword1');
  assert.notEqual(a, b);
  // Both should still verify against the same plaintext.
  assert.equal(await verifyPassword('SamePassword1', a), true);
  assert.equal(await verifyPassword('SamePassword1', b), true);
});

test('verifyPassword rejects malformed hash strings instead of throwing', async () => {
  const malformed = [
    '',
    'not-a-hash-at-all',
    'pbkdf2:sha256:100000:onlyfourparts',
    'md5:sha256:100000:c2FsdA==:aGFzaA==', // wrong algorithm prefix
    'pbkdf2:sha1:100000:c2FsdA==:aGFzaA==', // wrong hash prefix
  ];
  for (const stored of malformed) {
    await assert.doesNotReject(async () => {
      const result = await verifyPassword('anything', stored);
      assert.equal(result, false);
    }, `expected verifyPassword not to throw for: ${JSON.stringify(stored)}`);
  }
});

test('generateTempPassword returns a reasonably long, printable string', () => {
  const pw = generateTempPassword();
  assert.equal(typeof pw, 'string');
  assert.ok(pw.length >= 8, `expected at least 8 chars, got ${pw.length}`);
  assert.doesNotMatch(pw, /[+/=]/, 'should have stripped base64 padding/symbol chars');
});

// Shared auth helpers for Pages Functions. Lives under an underscore-prefixed folder
// so Cloudflare Pages excludes it from routing, but it's still a normal ES module that
// sibling function files can import.

const PBKDF2_ITERATIONS = 100000;

function bufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveBits(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${bufToBase64(salt)}:${bufToBase64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = parseInt(parts[2], 10);
  const salt = base64ToBuf(parts[3]);
  const expected = parts[4];
  const bits = await deriveBits(password, salt, iterations);
  const actual = bufToBase64(bits);
  // Constant-time-ish comparison: both are fixed-length base64 hashes, so a plain
  // length+content check doesn't leak meaningfully more than a proper constant-time
  // compare would for this use case.
  return actual.length === expected.length && actual === expected;
}

export function generateTempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return bufToBase64(bytes).replace(/[+/=]/g, '').slice(0, 12);
}

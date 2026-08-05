// Shared auth helpers for Pages Functions. Lives under an underscore-prefixed folder
// so Cloudflare Pages excludes it from routing, but it's still a normal ES module that
// sibling function files can import.

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const SESSION_COOKIE = 'session';
const FAILED_LOGIN_LOCKOUT_THRESHOLD = 5;
const FAILED_LOGIN_LOCKOUT_MINUTES = 15;

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
  return actual.length === expected.length && actual === expected;
}

export function generateTempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return bufToBase64(bytes).replace(/[+/=]/g, '').slice(0, 12);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function sessionCookieHeader(sessionId, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createSession(env, userId) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt)
    .run();
  return { id, expiresAt };
}

// Resolves the current user (if any) from the request's session cookie. Returns
// { user, sessionId } or null. Does not throw on missing/invalid/expired/revoked
// sessions -- callers treat null as "not logged in".
export async function getSessionUser(context) {
  const cookies = parseCookies(context.request.headers.get('Cookie'));
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const row = await context.env.DB.prepare(
    `SELECT s.expires_at AS session_expires_at, s.revoked_at AS session_revoked_at,
            u.id, u.email, u.name, u.role, u.status, u.must_change_password
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  )
    .bind(sessionId)
    .first();

  if (!row) return null;
  if (row.session_revoked_at) return null;
  if (new Date(row.session_expires_at) < new Date()) return null;
  if (row.status !== 'active') return null;

  return {
    sessionId,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      mustChangePassword: !!row.must_change_password,
    },
  };
}

export async function revokeSession(env, sessionId) {
  if (!sessionId) return;
  await env.DB.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(sessionId)
    .run();
}

// Returns { locked: bool } and, as a side effect, increments/resets the failed-login
// counter. Call recordFailedLogin() after a bad password, recordSuccessfulLogin()
// after a good one.
export async function isLockedOut(env, userRow) {
  if (!userRow.locked_until) return false;
  return new Date(userRow.locked_until) > new Date();
}

export async function recordFailedLogin(env, userId, currentAttempts) {
  const attempts = currentAttempts + 1;
  if (attempts >= FAILED_LOGIN_LOCKOUT_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + FAILED_LOGIN_LOCKOUT_MINUTES * 60 * 1000).toISOString();
    await env.DB.prepare(
      'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?'
    )
      .bind(attempts, lockedUntil, userId)
      .run();
  } else {
    await env.DB.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?')
      .bind(attempts, userId)
      .run();
  }
}

export async function recordSuccessfulLogin(env, userId) {
  await env.DB.prepare(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?'
  )
    .bind(userId)
    .run();
}

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

import { hashPassword, generateTempPassword, jsonResponse } from '../_utils/auth.js';
import { sendEmail } from '../_utils/email.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, email, name, status, must_change_password, created_at
     FROM users WHERE role = 'student' ORDER BY name COLLATE NOCASE`
  ).all();
  return jsonResponse({ ok: true, students: results });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  const email = (body.email || '').trim();
  const name = (body.name || '').trim();
  if (!email || !name) {
    return jsonResponse({ ok: false, error: 'Name and email are required' }, { status: 400 });
  }

  const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) {
    return jsonResponse({ ok: false, error: 'An account with that email already exists' }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const id = crypto.randomUUID();

  await context.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, status, must_change_password, created_by)
     VALUES (?, ?, ?, ?, 'student', 'active', 1, ?)`
  )
    .bind(id, email, passwordHash, name, context.data.user.id)
    .run();

  const emailSent = await sendEmail(context.env, {
    to: email,
    subject: 'Your CJN Boxing Academy account',
    text: `Hi ${name},\n\nAn account has been created for you at CJN Boxing Academy.\n\nLogin: https://cjnacademy.com/login.html\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nYou'll be asked to set a new password the first time you log in.`,
  });

  return jsonResponse({
    ok: true,
    student: { id, email, name, status: 'active' },
    emailSent,
    // Only surfaced when the email failed, so the coach can hand the password over
    // manually -- never included on a successful send.
    tempPassword: emailSent ? undefined : tempPassword,
  });
}

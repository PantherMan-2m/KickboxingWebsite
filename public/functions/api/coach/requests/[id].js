import { hashPassword, generateTempPassword, jsonResponse } from '../../_utils/auth.js';
import { sendEmail } from '../../_utils/email.js';

export async function onRequestPatch(context) {
  const { id } = context.params;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Malformed request' }, { status: 400 });
  }

  if (!['approve', 'reject'].includes(body.action)) {
    return jsonResponse({ ok: false, error: 'action must be approve or reject' }, { status: 400 });
  }

  if (body.action === 'reject') {
    const result = await context.env.DB.prepare(
      `DELETE FROM users WHERE id = ? AND status = 'pending'`
    )
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return jsonResponse({ ok: false, error: 'Request not found' }, { status: 404 });
    }
    return jsonResponse({ ok: true });
  }

  const pending = await context.env.DB.prepare(
    `SELECT email, name FROM users WHERE id = ? AND status = 'pending'`
  )
    .bind(id)
    .first();

  if (!pending) {
    return jsonResponse({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const result = await context.env.DB.prepare(
    `UPDATE users SET password_hash = ?, status = 'active', must_change_password = 1,
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`
  )
    .bind(passwordHash, id)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  const emailSent = await sendEmail(context.env, {
    to: pending.email,
    subject: 'Your CJN Boxing Academy account',
    text: `Hi ${pending.name},\n\nYour account request has been approved.\n\nLogin: https://cjnacademy.com/login.html\nEmail: ${pending.email}\nTemporary password: ${tempPassword}\n\nYou'll be asked to set a new password the first time you log in.`,
  });

  return jsonResponse({
    ok: true,
    emailSent,
    tempPassword: emailSent ? undefined : tempPassword,
  });
}

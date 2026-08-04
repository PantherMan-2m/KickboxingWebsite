// Shared Resend helper. Kept separate from the existing contact.js so that file (which
// already works in production) stays untouched.
export async function sendEmail(env, { to, subject, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CJN Boxing Academy <website@cjnacademy.com>',
      to: [to],
      subject,
      text,
    }),
  });
  return res.ok;
}

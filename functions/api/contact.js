export async function onRequestPost(context) {
  const formData = await context.request.formData();

  const name = formData.get('name') || '';
  const email = formData.get('email') || '';
  const phone = formData.get('phone') || '';
  const message = formData.get('message') || '';

  if (!name || !email || !message) {
    return new Response('Missing required fields', { status: 400 });
  }

  const emailBody = `
New trial class enquiry:

Name: ${name}
Email: ${email}
Phone: ${phone}

Message:
${message}
`;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CJN Website <website@cjnacademy.com>',
      to: ['cnedlox@gmail.com'],
      subject: 'New CJN trial class enquiry',
      text: emailBody,
      reply_to: email,
    }),
  });

  if (!resendResponse.ok) {
    return new Response('Email failed to send', { status: 500 });
  }

  return new Response('Message sent', { status: 200 });
}

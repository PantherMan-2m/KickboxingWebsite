// // Basic contact form handler (static): opens mail client as a fallback.
// document.getElementById('contactForm').addEventListener('submit', (e)=>{
//   e.preventDefault();
//   const data = new FormData(e.target);
//   const name = data.get('name');
//   const email = data.get('email');
//   const phone = data.get('phone') || '';
//   const msg = data.get('message');
//   const subject = encodeURIComponent('Trial class enquiry');
//   const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${msg}`);
//   const mailto = `mailto:giovannimatthews@gmail.com?subject=${subject}&body=${body}`;
//   document.getElementById('formStatus').textContent = 'Opening your email app…';
//   window.location.href = mailto;
// });

// Contact form handler: submits to Cloudflare Pages Function.
document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const status = document.getElementById('formStatus');
  const submitButton = form.querySelector('button[type="submit"]');

  status.textContent = 'Sending message…';
  submitButton.disabled = true;

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
    });

    if (!response.ok) {
      throw new Error('Form submission failed');
    }

    status.textContent = 'Thanks! Your message has been sent.';
    form.reset();
  } catch (error) {
    status.textContent = 'Sorry, something went wrong. Please WhatsApp us directly.';
  } finally {
    submitButton.disabled = false;
  }
});

/* Header scroll effect */
const header = document.querySelector('.site-header');
let lastY = window.scrollY;
const REVEAL_OFFSET = 40;  // was 80
const DELTA = 3;           // was 6

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  const dy = y - lastY;
  if (Math.abs(dy) < DELTA) return;

  if (dy > 0 && y > REVEAL_OFFSET) {
    header.classList.add('hide');
  } else {
    header.classList.remove('hide');
  }
  lastY = y;
}, { passive: true });

/* end of header scroll effect */

// Swap "Login" for "My dashboard" when the visitor already has a session.
// index.html is a static public page with no middleware, so this is the only
// way to know server-side session state -- a public, always-200 endpoint
// (see functions/api/auth/session.js) that never 401s or redirects, so the
// homepage never looks broken to an anonymous visitor with devtools open.
// Deferred to DOMContentLoaded (not called immediately): this script runs
// during document parsing, before app.js's `defer`red execution actually
// completes -- see the same-shaped comment in coach/attendance.html for why
// calling fetchJson() here directly would reference it before app.js has
// defined it.
document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await fetchJson('/api/auth/session');
  if (!data.user) return;
  const loginLink = document.querySelector('.nav-links a[href="/login.html"]');
  if (!loginLink) return;
  loginLink.textContent = 'My dashboard';
  loginLink.href = data.user.role === 'coach' ? '/coach/dashboard.html' : '/student/dashboard.html';
});

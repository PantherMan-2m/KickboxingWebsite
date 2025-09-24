/* menu-nav update */
const nav = document.querySelector('.nav-links');
const btn = document.querySelector('.menu-toggle');

btn.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('body-lock', isOpen); /* prevent body scroll when menu is open */
});

// Close menu when a link is clicked (nice UX)
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => nav.classList.remove('open'));
});

// Close the nav menu if user scrolls while it's open
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav-links');
  const btn = document.querySelector('.menu-toggle');

  if (nav.classList.contains('open')) {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('body-lock'); // also unlock body scroll if you’re using this
  }
}, { passive: true });

/*end of menu-nav update*/
document.getElementById('year').textContent = new Date().getFullYear();

// Basic contact form handler (static): opens mail client as a fallback.
document.getElementById('contactForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const data = new FormData(e.target);
  const name = data.get('name');
  const email = data.get('email');
  const phone = data.get('phone') || '';
  const msg = data.get('message');
  const subject = encodeURIComponent('Trial class enquiry');
  const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${msg}`);
  const mailto = `mailto:info@irontiger.co.za?subject=${subject}&body=${body}`;
  document.getElementById('formStatus').textContent = 'Opening your email app…';
  window.location.href = mailto;
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

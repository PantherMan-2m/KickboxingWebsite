// Shared frontend behaviour for every page: nav/hamburger, logout, escapeHtml,
// the #year footer stamp, and a small fetch-JSON wrapper. Loaded on all 12
// pages (see PLAN.md's T1.1), so every DOM lookup here is guarded -- login.html,
// change-password.html, and request-account.html have a logo-only header with
// none of the nav/logout elements below.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { response, data };
}

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

const navMenu = document.querySelector('.nav-links');
const menuBtn = document.querySelector('.menu-toggle');

if (navMenu && menuBtn) {
  menuBtn.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('body-lock', isOpen);
  });

  navMenu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      navMenu.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('body-lock');
    });
  });

  window.addEventListener('scroll', () => {
    if (navMenu.classList.contains('open')) {
      navMenu.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('body-lock');
    }
  }, { passive: true });
}

const logoutLink = document.getElementById('logoutLink');
if (logoutLink) {
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

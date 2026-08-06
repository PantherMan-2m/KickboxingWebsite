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

// The gym is in Somerset West (Africa/Johannesburg, UTC+2 fixed, no DST), but a visiting
// coach's browser could be set to any timezone. Mirrors _utils/dates.js's todayIso() --
// same fixed +2 offset -- so "today" agrees between server and client. Duplicated rather
// than shared, since this is a plain browser <script> with no bundler and that server
// helper is an ES module; see PLAN.md's "Conventions inherited from the existing
// codebase" (no build step) and the Phase 1 review's rejected finding #4 for the same
// tradeoff already accepted for dateFromQuery()/isValidDate(). Having the server hand the
// client "today" was considered and rejected too (T2.4, amended) -- it would put a
// network round-trip in front of populating a date input and make the page fail worse
// offline.
function sastTodayIso() {
  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
  return new Date(Date.now() + SAST_OFFSET_MS).toISOString().slice(0, 10);
}

// On a network failure or a non-JSON response body (a Cloudflare edge error
// page, an offline visitor), returns a synthetic {ok:false, error} data shape
// instead of throwing -- callers already branch on `data.ok`/`data.error` for
// the server's own failure responses, so this reuses that same path instead
// of requiring every caller to also wrap fetchJson in try/catch. `response`
// is null in this case; callers checking `response.ok` must use `response?.ok`.
async function fetchJson(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { response, data };
  } catch (error) {
    return { response: null, data: { ok: false, error: 'Network error. Please try again.' } };
  }
}

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

const navMenu = document.querySelector('.nav-links');
const menuBtn = document.querySelector('.menu-toggle');

if (navMenu && menuBtn) {
  const closeMenu = () => {
    navMenu.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('body-lock');
  };

  menuBtn.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('body-lock', isOpen);
  });

  navMenu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', closeMenu);
  });

  window.addEventListener('scroll', () => {
    if (navMenu.classList.contains('open')) closeMenu();
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

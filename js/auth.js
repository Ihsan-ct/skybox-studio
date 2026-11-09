"use strict";
// Status login (Google/Discord). Sesi di cookie HttpOnly; halaman hanya bertanya /api/auth/me.
window.Auth = (function () {
  let user = null;
  const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };
  const loginUrl = p => '/api/auth/login?provider=' + p + '&next=' + encodeURIComponent(location.pathname + location.hash);
  function buttons(parent, compact) {
    if (compact) mk('span', { textContent: 'Masuk:' }, parent);
    mk('a', { className: 'cta primary', href: loginUrl('google'), textContent: compact ? 'Google' : 'Masuk dengan Google' }, parent);
    mk('a', { className: 'cta', href: loginUrl('discord'), textContent: compact ? 'Discord' : 'Masuk dengan Discord' }, parent);
  }
  async function logout() { try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {} location.href = '/'; }
  function render() {
    const s = document.getElementById('authSlot'); if (!s) return;
    s.textContent = '';
    if (/[?&]login=gagal/.test(location.search)) mk('span', { textContent: 'Login gagal, coba lagi.', role: 'alert' }, s);
    if (user) {
      if (user.avatar) mk('img', { src: user.avatar, alt: '', width: 28, height: 28, referrerPolicy: 'no-referrer' }, s);
      mk('span', { textContent: user.name }, s);
      mk('button', { type: 'button', textContent: 'Keluar', onclick: logout }, s);
    } else buttons(s, true);
  }
  const ready = fetch('/api/auth/me').then(r => r.ok ? r.json() : { user: null }).then(j => { user = j.user || null; render(); return user; }).catch(() => { render(); return null; });
  return { ready, buttons, logout, get user() { return user; } };
})();

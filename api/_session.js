// Sesi stateless: cookie HttpOnly bertanda tangan HMAC-SHA256. Isinya hanya id/nama/avatar, tanpa API key.
import crypto from 'node:crypto';
export const COOKIE = 'rsk_sess', OAUTH_COOKIE = 'rsk_oauth', MAXAGE = 7 * 24 * 3600;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET belum diatur di server (minimal 16 karakter).');
  return s;
}
const mac = d => crypto.createHmac('sha256', secret()).update(d).digest('base64url');

export function sign(obj, ttl) {
  const d = Buffer.from(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttl })).toString('base64url');
  return d + '.' + mac(d);
}
export function verify(tok) {
  if (typeof tok !== 'string') return null;
  const i = tok.indexOf('.');
  if (i < 1) return null;
  const d = tok.slice(0, i), a = Buffer.from(tok.slice(i + 1)), b = Buffer.from(mac(d));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(d, 'base64url').toString());
    return o.exp > Date.now() / 1000 ? o : null;
  } catch (e) { return null; }
}
export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export const cookieStr = (name, val, maxAge) => `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export function getUser(req) {
  try { const s = verify(cookies(req)[COOKIE]); return (s && s.u) || null; } catch (e) { return null; }
}
export function requireUser(req, res) {
  try { secret(); } catch (e) { res.status(500).json({ error: e.message }); return null; }
  const u = getUser(req);
  if (!u) { res.status(401).json({ error: 'Belum masuk. Masuk dengan Google atau Discord dulu.' }); return null; }
  return u;
}

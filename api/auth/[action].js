// Login OAuth 2.0 (Authorization Code + PKCE) untuk Google dan Discord.
// Rute: /api/auth/login?provider=google|discord, /callback, /me, /logout
import crypto from 'node:crypto';
import { guard } from '../_guard.js';
import { sign, verify, cookies, cookieStr, getUser, COOKIE, OAUTH_COOKIE, MAXAGE } from '../_session.js';
import { dbReady, dbSet } from '../_db.js';

const PROVIDERS = {
  google: { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', info: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid profile', idEnv: 'GOOGLE_CLIENT_ID', secEnv: 'GOOGLE_CLIENT_SECRET' },
  discord: { auth: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', info: 'https://discord.com/api/users/@me', scope: 'identify', idEnv: 'DISCORD_CLIENT_ID', secEnv: 'DISCORD_CLIENT_SECRET' }
};
const origin = req => process.env.SITE_URL || ((req.headers['x-forwarded-proto'] || 'https').split(',')[0] + '://' + req.headers.host);
const safeNext = n => (typeof n === 'string' && /^\/[\w\-\/.]*(#[\w\-]*)?$/.test(n) && !n.startsWith('//')) ? n : '/studio';
const redirect = (res, url, cookie) => { if (cookie) res.setHeader('Set-Cookie', cookie); res.setHeader('Location', url); res.status(302); res.end(); };
const shortName = s => String(s || 'Pengguna').slice(0, 60);

function toUser(name, j) {
  if (name === 'google' && j.sub) return { id: 'google:' + j.sub, name: shortName(j.name), avatar: j.picture || '', p: 'google' };
  if (name === 'discord' && j.id) return { id: 'discord:' + j.id, name: shortName(j.global_name || j.username), avatar: j.avatar ? `https://cdn.discordapp.com/avatars/${j.id}/${j.avatar}.png?size=64` : '', p: 'discord' };
  return null;
}

async function login(req, res) {
  const name = req.query.provider, p = PROVIDERS[name];
  if (!p) { res.status(400).json({ error: 'Provider tidak dikenal.' }); return; }
  const clientId = process.env[p.idEnv];
  if (!clientId || !process.env.SESSION_SECRET) { res.status(500).json({ error: 'Login ' + name + ' belum dikonfigurasi di server.' }); return; }
  const state = crypto.randomBytes(16).toString('hex'), verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: origin(req) + '/api/auth/callback', response_type: 'code', scope: p.scope, state, code_challenge: challenge, code_challenge_method: 'S256' });
  if (name === 'google') q.set('prompt', 'select_account');
  redirect(res, p.auth + '?' + q, cookieStr(OAUTH_COOKIE, sign({ s: state, v: verifier, p: name, n: safeNext(req.query.next) }, 600), 600));
}

async function callback(req, res) {
  const clear = cookieStr(OAUTH_COOKIE, '', 0), fail = () => redirect(res, '/?login=gagal', clear);
  try {
    const o = verify(cookies(req)[OAUTH_COOKIE]), p = o && PROVIDERS[o.p];
    if (!o || !p || !req.query.code || req.query.state !== o.s) return fail();
    const tr = await fetch(p.token, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: origin(req) + '/api/auth/callback', client_id: process.env[p.idEnv], client_secret: process.env[p.secEnv], code_verifier: o.v })
    });
    const t = await tr.json().catch(() => ({}));
    if (!tr.ok || !t.access_token) return fail();
    const ur = await fetch(p.info, { headers: { Authorization: 'Bearer ' + t.access_token } });
    const user = ur.ok ? toUser(o.p, await ur.json().catch(() => ({}))) : null;
    if (!user) return fail();
    if (dbReady()) { try { await dbSet('user:' + user.id, { name: user.name, p: user.p, last: Date.now() }); } catch (e) { /* abaikan: login tetap sukses */ } }
    redirect(res, o.n, [clear, cookieStr(COOKIE, sign({ u: user }, MAXAGE), MAXAGE)]);
  } catch (e) { fail(); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const a = req.query.action;
  if (a === 'login' && req.method === 'GET') return login(req, res);
  if (a === 'callback' && req.method === 'GET') return callback(req, res); // navigasi lintas-situs dari provider; dilindungi state+PKCE
  if (a === 'me' && req.method === 'GET') { if (!guard(req, res)) return; res.status(200).json({ user: getUser(req) }); return; }
  if (a === 'logout' && req.method === 'POST') { if (!guard(req, res)) return; res.setHeader('Set-Cookie', cookieStr(COOKIE, '', 0)); res.status(200).json({ ok: true }); return; }
  res.status(404).json({ error: 'Rute tidak ditemukan.' });
}

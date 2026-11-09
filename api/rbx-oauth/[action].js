// OAuth 2.0 Roblox (Authorization Code + PKCE) — jalur cepat upload tanpa API key.
// User login dengan akun Roblox resmi, lalu 6 sisi diunggah ATAS NAMA akunnya
// lewat Open Cloud (scope asset:read + asset:write). Token OAuth disimpan di
// server dan terikat ke sesi situs (Google/Discord); tidak pernah dikirim ke browser.
//
// Rute: /api/rbx-oauth/status|login|callback|me|logout|upload|poll
// Env: RBX_OAUTH_CLIENT_ID, RBX_OAUTH_CLIENT_SECRET (+ SESSION_SECRET, Upstash opsional).

import crypto from 'node:crypto';
import { guard } from '../_guard.js';
import { requireUser, cookies, cookieStr, OAUTH_COOKIE } from '../_session.js';
import { dbReady, dbGet, dbSet } from '../_db.js';

const AUTHORIZE = 'https://apis.roblox.com/oauth/authorize';
const TOKEN = 'https://apis.roblox.com/oauth/v1/token';
const USERINFO = 'https://apis.roblox.com/oauth/v1/userinfo';
const SCOPES = 'openid profile asset:read asset:write';
const mem = new Map();   // fallback tanpa Upstash: key -> token (hilang saat cold start)

const origin = req => process.env.SITE_URL || ((req.headers['x-forwarded-proto'] || 'https').split(',')[0] + '://' + req.headers.host);
const redirect = (res, url, cookie) => { if (cookie) res.setHeader('Set-Cookie', cookie); res.setHeader('Location', url); res.status(302); res.end(); };
const conf = () => ({ id: process.env.RBX_OAUTH_CLIENT_ID, secret: process.env.RBX_OAUTH_CLIENT_SECRET });

function storeKey(u) { return 'rbxot:' + u; }
async function saveToken(u, t) { if (dbReady()) { try { await dbSet(storeKey(u), t); return; } catch (e) {} } mem.set(storeKey(u), t); }
async function loadToken(u) { if (dbReady()) { try { const v = await dbGet(storeKey(u)); if (v) return v; } catch (e) {} } return mem.get(storeKey(u)) || null; }
async function dropToken(u) { if (dbReady()) { try { await dbSet(storeKey(u), null); } catch (e) {} } mem.delete(storeKey(u)); }

async function tokenReq(body) {
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || ('HTTP ' + r.status));
  return j;
}

// Ambil token milik sesi ini; refresh otomatis kalau kedaluwarsa.
async function activeToken(u) {
  const t = await loadToken(u.id);
  if (!t) return null;
  if (t.exp > Date.now() + 60000) return t;
  try {
    const j = await tokenReq({
      grant_type: 'refresh_token', refresh_token: t.refresh,
      client_id: conf().id, client_secret: conf().secret
    });
    const nt = {
      access: j.access_token, refresh: j.refresh_token || t.refresh,
      exp: Date.now() + (j.expires_in || 3600) * 1000,
      sub: t.sub, name: t.name, picture: t.picture
    };
    await saveToken(u.id, nt);
    return nt;
  } catch (e) {
    await dropToken(u.id);
    return null;
  }
}

async function status(req, res) {
  if (!guard(req, res)) return;
  const c = conf();
  res.status(200).json({ configured: !!(c.id && c.secret && process.env.SESSION_SECRET) });
}

async function login(req, res) {
  if (!guard(req, res)) return;
  const u = requireUser(req, res); if (!u) return;
  const c = conf();
  if (!c.id || !c.secret) { res.status(500).json({ error: 'OAuth Roblox belum dikonfigurasi di server.' }); return; }
  const state = crypto.randomBytes(16).toString('hex'), verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: origin(req) + '/api/rbx-oauth/callback',
    response_type: 'code', scope: SCOPES, state,
    code_challenge: challenge, code_challenge_method: 'S256'
  });
  redirect(res, AUTHORIZE + '?' + q, cookieStr(OAUTH_COOKIE, Buffer.from(JSON.stringify({ s: state, v: verifier, u: u.id })).toString('base64url'), 600));
}

async function callback(req, res) {
  if (!guard(req, res)) return;
  const clear = cookieStr(OAUTH_COOKIE, '', 0);
  let back = '/';
  try {
    const o = JSON.parse(Buffer.from(String(cookies(req)[OAUTH_COOKIE] || ''), 'base64url').toString() || '{}');
    back = '/studio#rbx';
    if (!o.s || o.s !== req.query.state) throw new Error('state');
    const c = conf();
    const j = await tokenReq({
      grant_type: 'authorization_code', code: String(req.query.code),
      redirect_uri: origin(req) + '/api/rbx-oauth/callback',
      client_id: c.id, client_secret: c.secret, code_verifier: o.v
    });
    const ur = await fetch(USERINFO, { headers: { Authorization: 'Bearer ' + j.access_token } });
    const info = ur.ok ? await ur.json() : {};
    const t = {
      access: j.access_token, refresh: j.refresh_token,
      exp: Date.now() + (j.expires_in || 3600) * 1000,
      sub: String(info.sub || ''), name: String(info.name || 'Roblox'),
      picture: String(info.picture || '')
    };
    await saveToken(o.u, t);
    redirect(res, back + (back.includes('#') ? '&rbxok=1' : '#rbx&rbxok=1'), clear);
  } catch (e) {
    redirect(res, '/studio?rbxerr=' + encodeURIComponent(e.message === 'state' ? 'state tidak cocok' : e.message), clear);
  }
}

async function me(req, res) {
  if (!guard(req, res)) return;
  const u = requireUser(req, res); if (!u) return;
  const c = conf();
  const t = await activeToken(u);
  res.status(200).json({
    configured: !!(c.id && c.secret),
    loggedIn: !!t,
    name: t ? t.name : null,
    picture: t ? t.picture : null,
    userId: t ? t.sub : null
  });
}

async function logout(req, res) {
  if (!guard(req, res)) return;
  const u = requireUser(req, res); if (!u) return;
  await dropToken(u.id);
  res.status(200).json({ ok: true });
}

// Unggah satu sisi atas nama user (pengganti /api/roblox-create saat mode OAuth aktif).
async function upload(req, res) {
  if (!guard(req, res)) return;
  const u = requireUser(req, res); if (!u) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method tidak didukung.' }); return; }
  const t = await activeToken(u);
  if (!t || !t.sub) { res.status(401).json({ error: 'Belum login dengan Roblox (tombol "Login pakai Roblox").' }); return; }

  const { type, name } = req.query;
  if (type !== 'Image' && type !== 'Decal') { res.status(400).json({ error: 'Parameter type harus Image atau Decal.' }); return; }
  if (!name || typeof name !== 'string' || name.length > 60) { res.status(400).json({ error: 'Parameter name tidak valid.' }); return; }

  let buf;
  try {
    const chunks = [];
    let n = 0;
    for await (const chunk of req) {
      n += chunk.length;
      if (n > 4.4 * 1024 * 1024) { res.status(413).json({ error: 'Gambar lebih dari 4,4 MB (batas body Vercel).' }); return; }
      chunks.push(chunk);
    }
    buf = Buffer.concat(chunks);
  } catch (e) { res.status(400).json({ error: 'Gagal membaca body request.' }); return; }
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) { res.status(400).json({ error: 'Body bukan PNG yang valid.' }); return; }

  try {
    const form = new FormData();
    form.append('request', JSON.stringify({
      assetType: type, displayName: name,
      description: 'Skybox face, diunggah dengan Roblox Skybox Studio',
      creationContext: { creator: { userId: t.sub } }
    }));
    form.append('fileContent', new Blob([buf], { type: 'image/png' }), name + '.png');
    const r = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST', headers: { Authorization: 'Bearer ' + t.access }, body: form
    });
    const text = await r.text();
    if (!r.ok) { res.status(r.status).json({ error: 'Roblox menolak permintaan: ' + text.slice(0, 400) }); return; }
    const j = JSON.parse(text);
    if (!j.path) { res.status(502).json({ error: 'Respons Roblox tidak berisi operation path.' }); return; }
    res.status(200).json({ path: j.path });
  } catch (e) {
    res.status(502).json({ error: 'Gagal menghubungi Roblox: ' + e.message });
  }
}

// Polling status operasi upload (mode OAuth).
async function poll(req, res) {
  if (!guard(req, res)) return;
  const u = requireUser(req, res); if (!u) return;
  const t = await activeToken(u);
  if (!t) { res.status(401).json({ error: 'Sesi Roblox habis. Login ulang.' }); return; }
  const path = String(req.query.path || '');
  if (!/^operations\/[\w\-.]+$/.test(path)) { res.status(400).json({ error: 'Path operasi tidak valid.' }); return; }
  try {
    const r = await fetch('https://apis.roblox.com/assets/v1/' + path, { headers: { Authorization: 'Bearer ' + t.access } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(r.status).json({ error: 'Polling gagal: ' + JSON.stringify(j).slice(0, 300) }); return; }
    const op = j.operation || j;
    if (op.done) {
      const resp = op.response || {};
      if (op.error || resp.error) { res.status(200).json({ done: true, error: (op.error && op.error.message) || (resp.error && resp.error.message) || 'Ditolak Roblox' }); return; }
      const aid = resp.assetId;
      res.status(200).json({ done: true, assetId: aid ? String(aid) : null, moderation: resp.moderationStatus || null });
      return;
    }
    res.status(200).json({ done: false });
  } catch (e) {
    res.status(502).json({ error: 'Gagal menghubungi Roblox: ' + e.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const a = req.query.action;
  if (a === 'status' && req.method === 'GET') return status(req, res);
  if (a === 'login' && req.method === 'GET') return login(req, res);
  if (a === 'callback' && req.method === 'GET') return callback(req, res); // navigasi dari Roblox; dilindungi state + PKCE
  if (a === 'me' && req.method === 'GET') return me(req, res);
  if (a === 'logout' && req.method === 'POST') return logout(req, res);
  if (a === 'upload' && req.method === 'POST') return upload(req, res);
  if (a === 'poll' && req.method === 'GET') return poll(req, res);
  res.status(404).json({ error: 'Rute tidak ditemukan.' });
}

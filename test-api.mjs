// Cek cepat backend tanpa jaringan: node test-api.mjs  (atau npm test)
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
Object.assign(process.env, {
  SESSION_SECRET: 'rahasia-uji-minimal-16-karakter', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec',
  DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 'dsec', UPSTASH_REDIS_REST_URL: 'https://db.test', UPSTASH_REDIS_REST_TOKEN: 'tok'
});
const { default: create } = await import('./api/roblox-create.js');
const { default: poll } = await import('./api/roblox-poll.js');
const { default: auth } = await import('./api/auth/[action].js');
const { default: sync } = await import('./api/sync.js');
const { sign, COOKIE } = await import('./api/_session.js');

const png = n => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n)]);
function call(h, { method = 'POST', headers = {}, query = {}, body = Buffer.alloc(0) }) {
  const req = Object.assign(Readable.from([body]), { method, headers: { host: 'x.test', ...headers }, query });
  return new Promise(resolve => {
    const res = { code: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, o, h: this.h }); }, end() { resolve({ code: this.code, o: null, h: this.h }); } };
    h(req, res);
  });
}
const user = { id: 'google:1', name: 'Uji', avatar: '', p: 'google' };
const ck = { cookie: COOKIE + '=' + sign({ u: user }, 3600) };
const q = { type: 'Image', name: 'Sky_Ft', ownerType: 'user', ownerId: '1' };
const ok = { 'x-api-key': 'k', ...ck };

// --- proxy Roblox (sekarang wajib login)
globalThis.fetch = async () => ({ ok: true, text: async () => '{"path":"operations/abc"}' });
assert.equal((await call(create, { headers: { 'x-api-key': 'k' }, query: q, body: png(100) })).code, 401);
assert.equal((await call(create, { headers: { 'x-api-key': 'k', cookie: COOKIE + '=' + sign({ u: user }, -10) }, query: q, body: png(100) })).code, 401);
assert.equal((await call(create, { headers: { 'x-api-key': 'k', cookie: ck.cookie + 'x' }, query: q, body: png(100) })).code, 401);
assert.equal((await call(create, { headers: ok, query: q, body: png(100) })).o.path, 'operations/abc');
assert.equal((await call(create, { headers: ok, query: q, body: png(5 * 1024 * 1024) })).code, 413);
assert.equal((await call(create, { headers: ok, query: q, body: Buffer.from('bukan png!!') })).code, 400);
assert.equal((await call(create, { headers: { ...ok, origin: 'https://evil.test' }, query: q, body: png(100) })).code, 403);
assert.equal((await call(create, { headers: { ...ok, 'sec-fetch-site': 'cross-site' }, query: q, body: png(100) })).code, 403);
assert.equal((await call(create, { headers: { ...ok, origin: 'https://x.test' }, query: q, body: png(100) })).code, 200);
assert.equal((await call(poll, { method: 'GET', headers: { 'x-api-key': 'k' }, query: { path: 'operations/abc' } })).code, 401);
assert.equal((await call(poll, { method: 'GET', headers: ok, query: { path: 'operations/../x' } })).code, 400);
let url;
globalThis.fetch = async u => { url = u; return { ok: true, text: async () => '{"done":false}' }; };
const r = await call(poll, { method: 'GET', headers: ok, query: { path: 'operations/abc' } });
assert.equal(url, 'https://apis.roblox.com/assets/v1/operations/abc');
assert.equal(r.h['Cache-Control'], 'no-store');

// --- login OAuth
const lg = await call(auth, { method: 'GET', query: { action: 'login', provider: 'google', next: '/studio#rbx' } });
assert.equal(lg.code, 302);
assert.ok(lg.h.Location.startsWith('https://accounts.google.com/'));
assert.ok(lg.h.Location.includes('code_challenge_method=S256') && lg.h.Location.includes('redirect_uri=https%3A%2F%2Fx.test%2Fapi%2Fauth%2Fcallback'));
assert.match(lg.h['Set-Cookie'], /HttpOnly/);
assert.equal((await call(auth, { method: 'GET', query: { action: 'login', provider: 'github' } })).code, 400);
const state = new URL(lg.h.Location).searchParams.get('state');
const oc = { cookie: lg.h['Set-Cookie'].split(';')[0] };
assert.equal((await call(auth, { method: 'GET', headers: oc, query: { action: 'callback', code: 'c', state: 'salah' } })).h.Location, '/?login=gagal');
assert.equal((await call(auth, { method: 'GET', query: { action: 'callback', code: 'c', state } })).h.Location, '/?login=gagal');

let tokenBody, dbBody;
globalThis.fetch = async (u, o) => {
  if (u.includes('oauth2.googleapis.com')) { tokenBody = String(o.body); return { ok: true, json: async () => ({ access_token: 't' }) }; }
  if (u.includes('openidconnect')) return { ok: true, json: async () => ({ sub: '123', name: 'Budi', picture: 'https://lh3.googleusercontent.com/a' }) };
  dbBody = o && o.body; return { ok: true, json: async () => ({ result: 'OK' }) };
};
const cb = await call(auth, { method: 'GET', headers: oc, query: { action: 'callback', code: 'c', state } });
assert.equal(cb.code, 302);
assert.equal(cb.h.Location, '/studio#rbx');
assert.ok(tokenBody.includes('code_verifier='));
const sc = cb.h['Set-Cookie'].find(c => c.startsWith(COOKIE + '='));
assert.ok(/HttpOnly/.test(sc) && /Secure/.test(sc) && /Max-Age=604800/.test(sc));

// --- me / logout
const me = await call(auth, { method: 'GET', headers: { cookie: sc.split(';')[0] }, query: { action: 'me' } });
assert.equal(me.o.user.id, 'google:123');
assert.equal((await call(auth, { method: 'GET', query: { action: 'me' } })).o.user, null);
assert.match((await call(auth, { headers: ck, query: { action: 'logout' } })).h['Set-Cookie'], /Max-Age=0/);

// --- sinkronisasi: API key tidak boleh ikut ke database
assert.equal((await call(sync, { method: 'GET' })).code, 401);
const payload = { profiles: [{ id: '1', label: 'A', ownerType: 'user', ownerId: '5', prefix: 'S', type: 'auto', key: 'RAHASIA', enc: { data: 'XYZ' } }], history: [] };
const sp = await call(sync, { method: 'PUT', headers: ck, body: Buffer.from(JSON.stringify(payload)) });
assert.equal(sp.code, 200);
assert.ok(dbBody.includes('data:google:1') && !dbBody.includes('RAHASIA') && !dbBody.includes('XYZ'));
console.log('semua cek lolos');

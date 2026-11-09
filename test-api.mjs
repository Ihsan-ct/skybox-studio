// Cek cepat proxy tanpa jaringan: node test-api.mjs  (atau npm test)
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import create from './api/roblox-create.js';
import poll from './api/roblox-poll.js';

const png = n => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n)]);
function call(h, { method = 'POST', headers = {}, query = {}, body = Buffer.alloc(0) }) {
  const req = Object.assign(Readable.from([body]), { method, headers: { host: 'x.test', ...headers }, query });
  return new Promise(resolve => {
    const res = { code: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, o, h: this.h }); } };
    h(req, res);
  });
}
const q = { type: 'Image', name: 'Sky_Ft', ownerType: 'user', ownerId: '1' };
const ok = { 'x-api-key': 'k' };

globalThis.fetch = async () => ({ ok: true, text: async () => '{"path":"operations/abc"}' });
assert.equal((await call(create, { headers: ok, query: q, body: png(100) })).o.path, 'operations/abc');
assert.equal((await call(create, { headers: ok, query: q, body: png(5 * 1024 * 1024) })).code, 413);
assert.equal((await call(create, { headers: ok, query: q, body: Buffer.from('bukan png!!') })).code, 400);
assert.equal((await call(create, { headers: { ...ok, origin: 'https://evil.test' }, query: q, body: png(100) })).code, 403);
assert.equal((await call(create, { headers: { ...ok, 'sec-fetch-site': 'cross-site' }, query: q, body: png(100) })).code, 403);
assert.equal((await call(create, { headers: { ...ok, origin: 'https://x.test' }, query: q, body: png(100) })).code, 200);
assert.equal((await call(poll, { method: 'GET', headers: ok, query: { path: 'operations/../x' } })).code, 400);
const r = await call(poll, { method: 'GET', headers: ok, query: { path: 'operations/abc' } });
assert.equal(r.h['Cache-Control'], 'no-store');
console.log('semua cek lolos');

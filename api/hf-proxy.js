// Proxy relay ke Hugging Face Space untuk tab AI 360 — dipakai OTOMATIS oleh
// NAKA Studio bila koneksi langsung browser→Space gagal (ISP memblokir
// *.hf.space). Hanya host Space yang di-allowlist di bawah yang diizinkan.
// Edge runtime: streaming SSE dapat berjalan lama tanpa batas 10 detik.
// Allowlist berbasis pemilik Space (owner Hugging Face) — semua Space milik
// isandc diizinkan, sehingga Space kedua/ketiga tidak perlu ubah kode.
// Klien memanggil: /api/hf-proxy?h=<subdomain>.hf.space&p=<path>
const OWNER = 'isandc-';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, accept'
      }
    });
  }
  const { searchParams } = new URL(req.url);
  const host = (searchParams.get('h') || '').toLowerCase();
  const p = (searchParams.get('p') || '').replace(/^\/+/, '');
  const hostOk = host.endsWith('.hf.space') && host.startsWith(OWNER) && /^[a-z0-9-]+\.hf\.space$/.test(host);
  if (!hostOk || !p || !/^(gradio_api\/(upload|call\/|file=|info|config|queue\/))/.test(p)) {
    return new Response(JSON.stringify({ error: 'Path/host tidak diizinkan.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  const url = 'https://' + host + '/' + p;

  const headers = new Headers();
  for (const h of ['authorization', 'content-type', 'accept', 'user-agent', 'accept-language']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const init = { method: req.method, headers, redirect: 'follow' };
  if (!['GET', 'HEAD'].includes(req.method) && req.body) init.body = req.body;

  let r;
  try {
    r = await fetch(url, init);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Space tidak dapat dihubungi: ' + (e.message || e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  const out = new Headers();
  const drop = new Set(['content-encoding', 'transfer-encoding', 'connection', 'content-length', 'content-security-policy', 'x-frame-options']);
  for (const [k, v] of r.headers) if (!drop.has(k.toLowerCase())) out.set(k, v);
  out.set('Access-Control-Allow-Origin', '*');
  return new Response(r.body, { status: r.status, headers: out });
}

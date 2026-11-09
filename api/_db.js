// Upstash Redis lewat REST (hanya fetch, tanpa library). Dipakai untuk profil akun + riwayat. API key TIDAK pernah ditulis ke sini.
// Integrasi Vercel Marketplace bisa menyuntikkan nama UPSTASH_REDIS_REST_* atau KV_REST_API_*; keduanya didukung.
const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const dbReady = () => !!(URL_() && TOKEN());
async function cmd(args) {
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Database: ' + (j.error || 'HTTP ' + r.status));
  return j.result;
}
export const dbGet = async k => { const v = await cmd(['GET', k]); return v ? JSON.parse(v) : null; };
export const dbSet = (k, v) => cmd(['SET', k, JSON.stringify(v)]);

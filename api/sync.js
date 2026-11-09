// Sinkronisasi profil akun + riwayat upload per pengguna. API key/enc sengaja dibuang di server (opsi A).
import { guard } from './_guard.js';
import { requireUser } from './_session.js';
import { dbReady, dbGet, dbSet } from './_db.js';

const s = (v, n) => String(v == null ? '' : v).slice(0, n);
const FACE = ['Ft', 'Bk', 'Lf', 'Rt', 'Up', 'Dn'];
function clean(b) {
  const profiles = (Array.isArray(b.profiles) ? b.profiles : []).slice(0, 20).filter(p => p && /^\d+$/.test(String(p.ownerId))).map(p => ({
    id: s(p.id, 40), label: s(p.label, 40), ownerType: p.ownerType === 'group' ? 'group' : 'user', ownerId: String(p.ownerId).slice(0, 20),
    prefix: s(p.prefix, 40), type: ['auto', 'Image', 'Decal'].includes(p.type) ? p.type : 'auto'
  }));
  const history = (Array.isArray(b.history) ? b.history : []).slice(0, 20).map(h => {
    const ids = {};
    FACE.forEach(k => { if (h.ids && /^\d+$/.test(String(h.ids[k]))) ids[k] = String(h.ids[k]).slice(0, 20); });
    return { t: Number(h.t) || 0, base: s(h.base, 40), type: s(h.type, 10), ownerId: s(h.ownerId, 20), ids };
  });
  return { profiles, history };
}
async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 100000) throw new Error('Body terlalu besar.'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const u = requireUser(req, res); if (!u) return;
  if (!dbReady()) { res.status(501).json({ error: 'Database belum dikonfigurasi.' }); return; }
  const key = 'data:' + u.id;
  try {
    if (req.method === 'GET') { res.status(200).json((await dbGet(key)) || { profiles: null, history: null }); return; }
    if (req.method === 'PUT') { await dbSet(key, clean(await readJson(req) || {})); res.status(200).json({ ok: true }); return; }
    res.status(405).json({ error: 'Method tidak didukung.' });
  } catch (e) { res.status(502).json({ error: e.message }); }
}

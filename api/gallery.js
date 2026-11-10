// Galeri Komunitas NAKA — berbagi & menjelajah setelan skybox (ID aset) antar kreator.
// GET  /api/gallery            -> daftar publik (tanpa login)
// POST /api/gallery            -> bagikan setelan saat ini (wajib login; nama+6 ID)
// DELETE /api/gallery?id=...   -> hapus entri sendiri (hanya pemilik)
// Penyimpanan: Upstash Redis (kunci naka:gallery:<id> + indeks naka:gallery:index)
import { guard } from './_guard.js';
import { requireUser } from './_session.js';
import { dbReady, dbGet, dbSet } from './_db.js';

const INDEX_KEY = 'naka:gallery:index';
const itemKey = id => 'naka:gallery:' + id;
const MAX_ITEMS = 60;

async function readIndex() { return (await dbGet(INDEX_KEY)) || []; }
async function writeIndex(idx) { await dbSet(INDEX_KEY, idx.slice(0, MAX_ITEMS)); }

const clean = (s, max) => String(s || '').replace(/[^\w\- .]/g, '').trim().slice(0, 40);

export default async function handler(req, res) {
  if (!guard(req, res)) return;

  if (req.method === 'GET') {
    if (!dbReady()) { res.status(200).json({ items: [], db: false }); return; }
    try {
      const idx = await readIndex();
      const items = [];
      for (const id of idx) {
        const it = await dbGet(itemKey(id));
        if (it) items.push(it);
      }
      items.sort((a, b) => b.t - a.t);
      res.status(200).json({ items });
    } catch (e) {
      res.status(502).json({ error: 'Gagal membaca galeri: ' + e.message });
    }
    return;
  }

  const u = requireUser(req, res);
  if (!u) return;

  if (req.method === 'POST') {
    if (!dbReady()) { res.status(503).json({ error: 'Database belum dikonfigurasi di server.' }); return; }
    let body = {};
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch (e) { res.status(400).json({ error: 'Body JSON tidak valid.' }); return; }

    const name = clean(body.name, 40) || ('Sky ' + u.name);
    const ids = body.ids || {};
    const keys = ['Ft', 'Bk', 'Lf', 'Rt', 'Up', 'Dn'];
    for (const k of keys) {
      if (!/^\d{5,}$/.test(String(ids[k] || ''))) { res.status(400).json({ error: 'ID Skybox' + k + ' tidak valid.' }); return; }
    }
    const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = { id, name, author: u.name, ids, t: Date.now() };
    try {
      await dbSet(itemKey(id), entry);
      const idx = await readIndex();
      idx.unshift(id);
      await writeIndex(idx);
      res.status(200).json({ ok: true, id });
    } catch (e) {
      res.status(502).json({ error: 'Gagal menyimpan: ' + e.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    if (!dbReady()) { res.status(503).json({ error: 'Database belum dikonfigurasi.' }); return; }
    const id = String(req.query.id || '');
    try {
      const it = await dbGet(itemKey(id));
      if (!it) { res.status(404).json({ error: 'Entri tidak ditemukan.' }); return; }
      // hanya pemilik (nama author = nama sesi) yang boleh hapus
      if (it.author !== u.name) { res.status(403).json({ error: 'Bukan milikmu.' }); return; }
      await dbSet(itemKey(id), null);
      await writeIndex((await readIndex()).filter(x => x !== id));
      res.status(200).json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
    return;
  }

  res.status(405).json({ error: 'Method tidak didukung.' });
}

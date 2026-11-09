// Vercel Serverless Function — proxy ke Roblox Open Cloud Assets API.
// Browser tidak bisa fetch langsung ke apis.roblox.com (CORS diblokir Roblox),
// jadi request lewat sini dulu (same-origin dari sisi browser), baru diteruskan
// server-to-server ke Roblox. API key TIDAK disimpan di mana pun di server ini —
// hanya diteruskan apa adanya dari header request ke header request berikutnya.

import { guard } from './_guard.js';

// Vercel membatasi body request function sampai 4,5 MB (413 sebelum kode ini jalan).
const MAX_BYTES = 4.4 * 1024 * 1024;

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method tidak didukung, gunakan POST.' });
    return;
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    res.status(400).json({ error: 'Header x-api-key wajib diisi.' });
    return;
  }

  const { type, name, ownerType, ownerId } = req.query;
  if (type !== 'Image' && type !== 'Decal') {
    res.status(400).json({ error: 'Parameter type harus Image atau Decal.' });
    return;
  }
  if (!name || typeof name !== 'string' || name.length > 60) {
    res.status(400).json({ error: 'Parameter name tidak valid.' });
    return;
  }
  if (ownerType !== 'user' && ownerType !== 'group') {
    res.status(400).json({ error: 'Parameter ownerType harus user atau group.' });
    return;
  }
  if (!ownerId || !/^\d+$/.test(ownerId)) {
    res.status(400).json({ error: 'Parameter ownerId harus berupa angka.' });
    return;
  }

  let buf;
  try {
    const chunks = [];
    let n = 0;
    for await (const chunk of req) {
      n += chunk.length;
      if (n > MAX_BYTES) { res.status(413).json({ error: 'Gambar lebih dari 4,4 MB (batas body Vercel).' }); return; }
      chunks.push(chunk);
    }
    buf = Buffer.concat(chunks);
  } catch (e) {
    res.status(400).json({ error: 'Gagal membaca body request.' });
    return;
  }

  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
    res.status(400).json({ error: 'Body bukan berkas PNG yang valid.' });
    return;
  }
  if (buf.length > MAX_BYTES) {
    res.status(413).json({ error: 'Gambar lebih dari 4,4 MB (batas body Vercel).' });
    return;
  }

  const creator = ownerType === 'group' ? { groupId: String(ownerId) } : { userId: String(ownerId) };

  try {
    const form = new FormData();
    form.append('request', JSON.stringify({
      assetType: type,
      displayName: name,
      description: 'Skybox face, diunggah dengan Roblox Skybox Studio',
      creationContext: { creator }
    }));
    form.append('fileContent', new Blob([buf], { type: 'image/png' }), name + '.png');

    const r = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: form
    });
    const text = await r.text();

    if (!r.ok) {
      res.status(r.status).json({ error: 'Roblox menolak permintaan: ' + text.slice(0, 400) });
      return;
    }

    const j = JSON.parse(text);
    if (!j.path) {
      res.status(502).json({ error: 'Respons Roblox tidak berisi operation path.' });
      return;
    }
    res.status(200).json({ path: j.path });
  } catch (e) {
    res.status(502).json({ error: 'Gagal menghubungi Roblox: ' + e.message });
  }
}

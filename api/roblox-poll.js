// Vercel Serverless Function — cek status operation Open Cloud (polling).
// Satu panggilan = satu cek, tanpa loop sleep di server (hindari timeout
// serverless function). Browser yang mengatur jeda antar panggilan.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method tidak didukung, gunakan GET.' });
    return;
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    res.status(400).json({ error: 'Header x-api-key wajib diisi.' });
    return;
  }

  const { path } = req.query;
  if (!path || typeof path !== 'string' || !/^operations\/[\w\-]+$/.test(path)) {
    res.status(400).json({ error: 'Parameter path tidak valid.' });
    return;
  }

  try {
    const r = await fetch('https://apis.roblox.com/' + path, {
      headers: { 'x-api-key': apiKey }
    });
    const text = await r.text();

    if (!r.ok) {
      res.status(r.status).json({ error: 'Polling gagal: ' + text.slice(0, 300) });
      return;
    }

    const j = JSON.parse(text);
    if (!j.done) {
      res.status(200).json({ done: false });
      return;
    }
    if (j.error) {
      res.status(200).json({ done: true, error: JSON.stringify(j.error).slice(0, 300) });
      return;
    }
    if (j.response && j.response.assetId) {
      res.status(200).json({ done: true, assetId: String(j.response.assetId) });
      return;
    }
    res.status(200).json({ done: true, error: 'Operasi selesai tanpa assetId.' });
  } catch (e) {
    res.status(502).json({ error: 'Gagal menghubungi Roblox: ' + e.message });
  }
}

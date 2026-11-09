// Dipakai kedua endpoint. Awalan "_" membuat Vercel tidak menjadikannya route.
// Tolak request lintas-situs dari browser; curl/CLI (tanpa header Sec-Fetch/Origin) tetap lolos.
export function guard(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const site = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  const cross = (site && site !== 'same-origin' && site !== 'none') ||
    (origin && (origin === 'null' || new URL(origin).host !== req.headers.host));
  if (cross) { res.status(403).json({ error: 'Request lintas-situs ditolak.' }); return false; }
  return true;
}

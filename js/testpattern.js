"use strict";
window.makeTestPanorama = function () {
  const PI = Math.PI;
  const FACES = window.GLConvert.FACES;
  const S = 512, data = {};
  const colors = { Ft: '#d9534f', Bk: '#4a78d1', Lf: '#4caf50', Rt: '#e6b800', Up: '#cfd8dc', Dn: '#5f7380' };
  
  FACES.forEach(f => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = colors[f.k]; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo(i * S / 8, 0); g.lineTo(i * S / 8, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * S / 8); g.lineTo(S, i * S / 8); g.stroke();
    }
    if (f.k !== 'Up' && f.k !== 'Dn') { g.fillStyle = '#000'; g.fillRect(0, S / 2 - 3, S, 6); }
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(4, 4, S - 8, S - 8);
    g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 92px sans-serif'; g.fillText(f.name.toUpperCase(), S / 2, S * 0.3);
    g.font = 'bold 48px sans-serif'; g.fillText('Skybox' + f.k, S / 2, S * 0.78);
    g.beginPath(); g.moveTo(S / 2, 18); g.lineTo(S / 2 - 26, 62); g.lineTo(S / 2 + 26, 62); g.closePath(); g.fill();
    data[f.k] = g.getImageData(0, 0, S, S).data;
  });

  const W = 2048, H = 1024;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d'); const img = og.createImageData(W, H); const px = img.data;
  const byK = {}; FACES.forEach(f => byK[f.k] = f);

  for (let y = 0; y < H; y++) {
    const lat = PI / 2 - (y + 0.5) / H * PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5) / W * 2 * PI - PI;
      const dx = Math.sin(lon) * cl, dy = sl, dz = -Math.cos(lon) * cl;
      const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
      let k;
      if (ay >= ax && ay >= az) k = dy > 0 ? 'Up' : 'Dn';
      else if (ax >= az) k = dx > 0 ? 'Rt' : 'Lf';
      else k = dz < 0 ? 'Ft' : 'Bk';
      const f = byK[k];
      const fd = dx * f.f[0] + dy * f.f[1] + dz * f.f[2];
      const fx = (dx * f.r[0] + dy * f.r[1] + dz * f.r[2]) / fd;
      const fy = (dx * f.u[0] + dy * f.u[1] + dz * f.u[2]) / fd;
      const ix = Math.min(S - 1, Math.max(0, Math.floor((fx * 0.5 + 0.5) * S)));
      const iy = Math.min(S - 1, Math.max(0, Math.floor((0.5 - fy * 0.5) * S)));
      const si = (iy * S + ix) * 4, di = (y * W + x) * 4, d = data[k];
      px[di] = d[si]; px[di + 1] = d[si + 1]; px[di + 2] = d[si + 2]; px[di + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
};

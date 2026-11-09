"use strict";
// Langit contoh prosedural untuk empty state: pengguna bisa mencoba aplikasi
// tanpa punya gambar sendiri. Semua digambar langsung ke canvas 2048×1024
// (panorama 2:1, tinggi = langit saja — horizon di tepi bawah).
window.SampleSkies = (function () {
  const W = 2048, H = 1024;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function base() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return { c, g: c.getContext('2d') };
  }

  // Gumpalan awan lembut (lingkaran radial transparan berkelompok).
  function puff(g, x, y, r, alpha, tint) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + tint + ',' + alpha + ')');
    gr.addColorStop(0.6, 'rgba(' + tint + ',' + alpha * 0.5 + ')');
    gr.addColorStop(1, 'rgba(' + tint + ',0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  function cloudCluster(g, x, y, scale, tint, alpha) {
    const n = Math.round(rnd(4, 8));
    for (let i = 0; i < n; i++) {
      puff(g, x + rnd(-scale, scale) * 1.6, y + rnd(-scale * 0.35, scale * 0.35), scale * rnd(0.5, 1.15), alpha, tint);
    }
  }

  // Pita/pilar awan horizontal yang menyambung di tepi kiri-kanan.
  function cloudBand(g, y, count, scale, tint, alpha) {
    for (let i = 0; i < count; i++) {
      const x = (i / count) * W + rnd(-W / count, W / count) * 0.4;
      cloudCluster(g, (x + W) % W, y, scale, tint, alpha);
    }
  }

  function stars(g, count, maxY, bright) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W, y = Math.pow(Math.random(), 1.4) * maxY;
      const r = Math.random() < 0.94 ? rnd(0.5, 1.2) : rnd(1.4, 2.2);
      const a = bright ? rnd(0.5, 1) : rnd(0.25, 0.75);
      g.fillStyle = 'rgba(255,255,255,' + a + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }

  function verticalGradient(g, stops) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    stops.forEach(([p, col]) => gr.addColorStop(p, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }

  function glow(g, x, y, r, color) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const makers = {
    // Siang cerah: biru pekat di zenith, awan kumulus, pendar matahari.
    siang() {
      const { c, g } = base();
      verticalGradient(g, [[0, '#2f6fce'], [0.55, '#5a9ae8'], [0.85, '#9dc6f2'], [1, '#d7e9fb']]);
      glow(g, W * 0.32, H * 0.86, H * 0.5, 'rgba(255,244,214,0.55)');
      cloudBand(g, H * 0.62, 9, rnd(46, 62), '255,255,255', 0.85);
      cloudBand(g, H * 0.42, 6, rnd(34, 48), '255,255,255', 0.6);
      cloudBand(g, H * 0.22, 4, rnd(26, 36), '236,244,252', 0.45);
      return c;
    },
    // Senja: oranye → merah muda → ungu, awan berlapis tipis.
    senja() {
      const { c, g } = base();
      verticalGradient(g, [[0, '#31255e'], [0.4, '#8a4d8f'], [0.62, '#e0728a'], [0.8, '#f6a45f'], [1, '#ffcf86']]);
      glow(g, W * 0.62, H * 0.94, H * 0.55, 'rgba(255,206,120,0.6)');
      cloudBand(g, H * 0.7, 8, rnd(44, 60), '255,214,170', 0.7);
      cloudBand(g, H * 0.52, 7, rnd(38, 52), '240,178,150', 0.55);
      cloudBand(g, H * 0.3, 5, rnd(30, 40), '205,150,190', 0.4);
      return c;
    },
    // Malam berbintang: biru gelap, bintang, pita bimasakti, bulan.
    malam() {
      const { c, g } = base();
      verticalGradient(g, [[0, '#050914'], [0.55, '#0a1428'], [0.85, '#14213c'], [1, '#1d2c4d']]);
      // pita bimasakti diagonal
      g.save();
      g.translate(W / 2, H * 0.42); g.rotate(-0.32);
      glow(g, 0, 0, H * 0.9, 'rgba(120,140,200,0.16)');
      glow(g, -W * 0.2, H * 0.1, H * 0.55, 'rgba(150,130,190,0.12)');
      g.restore();
      stars(g, 900, H * 0.95, false);
      stars(g, 140, H * 0.95, true);
      // bulan sabit lembut
      const mx = W * 0.78, my = H * 0.2;
      glow(g, mx, my, H * 0.16, 'rgba(220,230,255,0.35)');
      g.fillStyle = 'rgba(235,240,252,0.95)';
      g.beginPath(); g.arc(mx, my, H * 0.045, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(10,20,40,0.92)';
      g.beginPath(); g.arc(mx - H * 0.02, my - H * 0.012, H * 0.041, 0, Math.PI * 2); g.fill();
      cloudBand(g, H * 0.55, 4, rnd(40, 55), '150,170,210', 0.22);
      return c;
    }
  };

  function make(kind) {
    const m = makers[kind] || makers.siang;
    return m();
  }

  return { make, kinds: ['siang', 'senja', 'malam'] };
})();

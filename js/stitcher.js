"use strict";
// Stitcher: 6 sisi skybox -> 1 panorama equirectangular (kebalikan dari gl-convert.js)
window.Stitcher = (function () {
  const FACES = window.GLConvert.FACES;
  const KEYMAP = { ft: 'Ft', front: 'Ft', bk: 'Bk', back: 'Bk', lf: 'Lf', left: 'Lf', rt: 'Rt', right: 'Rt', up: 'Up', top: 'Up', dn: 'Dn', down: 'Dn', bottom: 'Dn' };
  const slots = {};          // k -> { img, w, h, name }
  const rot = { Up: 0, Dn: 0 };
  let outCanvas = null, busy = false;
  let statusEl, outEl, btnRun, btnDl, btnSend;

  const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };
  const setStatus = t => { statusEl.textContent = t; };

  function guessKey(filename) {
    const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
    const m = base.match(/(ft|front|bk|back|lf|left|rt|right|up|top|dn|down|bottom)$/);
    return m ? KEYMAP[m[1]] : null;
  }

  function loadFile(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res({ img, w: img.naturalWidth, h: img.naturalHeight, name: file.name }); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Tidak bisa membaca ' + file.name)); };
      img.src = url;
    });
  }

  function drawThumb(k) {
    const c = slotUI[k].thumb, s = slots[k], g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (s) g.drawImage(s.img, 0, 0, c.width, c.height);
    slotUI[k].label.textContent = s ? (s.name + ' (' + s.w + '×' + s.h + ')') : 'kosong';
  }

  async function assign(k, file) {
    try { slots[k] = await loadFile(file); drawThumb(k); }
    catch (e) { setStatus(e.message); }
  }

  async function assignMany(files) {
    const unknown = [];
    for (const f of files) {
      const k = guessKey(f.name);
      if (k) await assign(k, f); else unknown.push(f.name);
    }
    setStatus(unknown.length ? 'Nama file tidak dikenali (pilih manual per sisi): ' + unknown.join(', ') : 'File terpasang. Periksa kotak sisi, lalu tekan Gabungkan.');
  }

  function validate() {
    const missing = FACES.filter(f => !slots[f.k]).map(f => 'Skybox' + f.k);
    if (missing.length) return 'Sisi belum lengkap: ' + missing.join(', ') + '.';
    const S = slots.Ft.w;
    for (const f of FACES) {
      const s = slots[f.k];
      if (s.w !== s.h) return 'Sisi ' + f.name + ' tidak persegi (' + s.w + '×' + s.h + ').';
      if (s.w !== S) return 'Ukuran sisi harus sama. ' + f.name + ' = ' + s.w + ', Front = ' + S + '.';
    }
    return null;
  }

  async function run() {
    if (busy) return;
    const err = validate();
    if (err) { setStatus(err); return; }
    busy = true; btnRun.disabled = true; btnDl.disabled = true; btnSend.disabled = true;
    try {
      const S = slots.Ft.w;
      const W = Math.min(4 * S, 8192), H = W / 2;
      const data = {};
      FACES.forEach(f => {
        const c = document.createElement('canvas'); c.width = c.height = S;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(slots[f.k].img, 0, 0, S, S);
        data[f.k] = g.getImageData(0, 0, S, S).data;
      });
      const rotRad = { Up: rot.Up * Math.PI / 180, Dn: rot.Dn * Math.PI / 180 };
      const cs = {}, sn = {};
      ['Up', 'Dn'].forEach(k => { cs[k] = Math.cos(rotRad[k]); sn[k] = Math.sin(rotRad[k]); });
      const byK = {}; FACES.forEach(f => byK[f.k] = f);

      outCanvas = document.createElement('canvas'); outCanvas.width = W; outCanvas.height = H;
      const og = outCanvas.getContext('2d');
      const img = og.createImageData(W, H), px = img.data;
      const sinL = new Float32Array(W), cosL = new Float32Array(W);
      for (let x = 0; x < W; x++) { const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI; sinL[x] = Math.sin(lon); cosL[x] = Math.cos(lon); }

      const smax = S - 1;
      for (let y = 0; y < H; y++) {
        const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < W; x++) {
          const dx = sinL[x] * cl, dy = sl, dz = -cosL[x] * cl;
          const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
          let k;
          if (ay >= ax && ay >= az) k = dy > 0 ? 'Up' : 'Dn';
          else if (ax >= az) k = dx > 0 ? 'Rt' : 'Lf';
          else k = dz < 0 ? 'Ft' : 'Bk';
          const f = byK[k];
          const fd = dx * f.f[0] + dy * f.f[1] + dz * f.f[2];
          let fx = (dx * f.r[0] + dy * f.r[1] + dz * f.r[2]) / fd;
          let fy = (dx * f.u[0] + dy * f.u[1] + dz * f.u[2]) / fd;
          if (k === 'Up' || k === 'Dn') { const nx = cs[k] * fx + sn[k] * fy; fy = -sn[k] * fx + cs[k] * fy; fx = nx; }
          let ix = (fx * 0.5 + 0.5) * S - 0.5, iy = (0.5 - fy * 0.5) * S - 0.5;
          ix = ix < 0 ? 0 : ix > smax ? smax : ix; iy = iy < 0 ? 0 : iy > smax ? smax : iy;
          const x0 = Math.floor(ix), y0 = Math.floor(iy);
          const x1 = x0 < smax ? x0 + 1 : x0, y1 = y0 < smax ? y0 + 1 : y0;
          const tx = ix - x0, ty = iy - y0, d = data[k];
          const i00 = (y0 * S + x0) * 4, i10 = (y0 * S + x1) * 4, i01 = (y1 * S + x0) * 4, i11 = (y1 * S + x1) * 4;
          const o = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) {
            const top = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * tx;
            const bot = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * tx;
            px[o + c] = top + (bot - top) * ty;
          }
          px[o + 3] = 255;
        }
        if (y % 64 === 63) { setStatus('Menggabungkan… ' + Math.round((y + 1) / H * 100) + '%'); await new Promise(r => setTimeout(r, 0)); }
      }
      og.putImageData(img, 0, 0);
      outEl.width = 1024; outEl.height = 512;
      outEl.getContext('2d').drawImage(outCanvas, 0, 0, 1024, 512);
      setStatus('Selesai: panorama ' + W + '×' + H + ' px.');
      btnDl.disabled = false; btnSend.disabled = false;
    } catch (e) {
      setStatus('Gagal menggabungkan: ' + e.message);
    } finally { busy = false; btnRun.disabled = false; }
  }

  function download() {
    if (!outCanvas) return;
    outCanvas.toBlob(b => {
      if (!b) { setStatus('Gagal membuat PNG.'); return; }
      const url = URL.createObjectURL(b);
      const a = mk('a', { href: url, download: 'Panorama_' + outCanvas.width + 'x' + outCanvas.height + '.png' }, document.body);
      a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'image/png');
  }

  const slotUI = {};
  function build(root) {
    mk('p', { textContent: 'Gabungkan 6 sisi skybox menjadi satu panorama 360° (2:1) untuk diedit atau dikonversi ulang. Semua sisi harus persegi dan berukuran sama.' }, root).style.marginTop = '0';
    const row = mk('div', { className: 'row' }, root);
    const multi = mk('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true }, row);
    const pick = mk('button', { type: 'button', textContent: 'Pilih 6 file sekaligus' }, row);
    pick.addEventListener('click', () => multi.click());
    multi.addEventListener('change', () => { assignMany(Array.from(multi.files)); multi.value = ''; });

    const grid = mk('div', {}, root);
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px';
    FACES.forEach(f => {
      const cell = mk('div', {}, grid);
      cell.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:6px;background:var(--panel2);font-size:12px';
      mk('strong', { textContent: 'Skybox' + f.k + ' (' + f.name + ')' }, cell);
      const th = mk('canvas', { width: 120, height: 120 }, cell);
      th.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:1;background:#000;border-radius:4px;margin:4px 0';
      const lab = mk('div', { textContent: 'kosong' }, cell); lab.style.cssText = 'color:var(--muted);word-break:break-all;min-height:32px';
      const inp = mk('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true }, cell);
      const b = mk('button', { type: 'button', textContent: 'Pilih' }, cell); b.style.minHeight = '32px';
      b.addEventListener('click', () => inp.click());
      inp.addEventListener('change', () => { if (inp.files[0]) assign(f.k, inp.files[0]); inp.value = ''; });
      slotUI[f.k] = { thumb: th, label: lab };
    });

    mk('p', { className: 'note', textContent: 'Kalau sisi Up/Down tadinya diputar saat ekspor, pilih rotasi yang sama di sini agar kembali ke posisi asli.' }, root);
    const rr = mk('div', { className: 'row' }, root);
    ['Up', 'Dn'].forEach(k => {
      const lab = mk('label', { textContent: 'Rotasi ' + k + ': ' }, rr);
      const sel = mk('select', {}, lab); sel.style.cssText = 'min-height:36px;margin-left:6px';
      [0, 90, 180, 270].forEach(v => mk('option', { value: v, textContent: v + '°' }, sel));
      sel.addEventListener('change', () => { rot[k] = Number(sel.value); });
    });

    const act = mk('div', { className: 'row' }, root);
    btnRun = mk('button', { type: 'button', className: 'primary', textContent: 'Gabungkan' }, act);
    btnDl = mk('button', { type: 'button', textContent: 'Unduh PNG', disabled: true }, act);
    btnSend = mk('button', { type: 'button', textContent: 'Kirim ke Konverter', disabled: true }, act);
    btnRun.addEventListener('click', run);
    btnDl.addEventListener('click', download);
    btnSend.addEventListener('click', () => {
      if (outCanvas && window.MainApp && window.MainApp.loadPanorama) window.MainApp.loadPanorama(outCanvas, 'Panorama (stitcher)');
    });

    statusEl = mk('div', { id: 'stitchStatus', textContent: 'Belum ada file.' }, root);
    statusEl.setAttribute('role', 'status'); statusEl.style.cssText = 'min-height:22px;margin-top:8px;font-size:13px;color:var(--muted)';
    outEl = mk('canvas', { width: 1024, height: 512 }, root);
    outEl.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:2/1;background:#000;border:1px solid var(--line);border-radius:8px;margin-top:8px';
  }

  return { build };
})();

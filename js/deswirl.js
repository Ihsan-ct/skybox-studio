"use strict";
// De-swirl: memperbaiki panorama AI yang 'berpilin' (pusaran radial di satu titik).
// Cara kerja: polar unwrap terbalik - gambar dianggap proyeksi stereografis dengan
// pusat di titik pilinan; setiap baris panorama (latitude) disampel dari lingkaran
// radius tertentu di gambar sumber. Hasilnya panorama equirectangular yang rapi,
// lalu bisa diteruskan ke konversi biasa lewat "Kirim ke Konverter".
window.DeSwirl = (function () {
  const PI_HALF = Math.PI / 2;

  // Bangun panorama equirect W x H dari gambar sumber berpilin.
  // o = { cx, cy (pusat, 0..1), scale, rot (derajat), cover (derajat, cakupan swirl) }
  function buildPano(src, sw, sh, o) {
    const W = o.width || 2048, H = W / 2;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const og = out.getContext('2d');
    const img = og.createImageData(W, H);
    const od = img.data;

    const sc = Math.min(1, 2048 / Math.max(sw, sh));
    const pw = Math.max(1, Math.round(sw * sc)), ph = Math.max(1, Math.round(sh * sc));
    const pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;
    const pg = pc.getContext('2d', { willReadFrequently: true });
    pg.drawImage(src, 0, 0, pw, ph);
    const px = pg.getImageData(0, 0, pw, ph).data;

    const cx = (o.cx ?? 0.5) * pw, cy = (o.cy ?? 0.5) * ph;
    const maxR = Math.min(pw, ph) / 2;
    const rot = (o.rot || 0) * Math.PI / 180;
    const R = maxR * (o.scale || 1) / Math.tan(((o.cover ?? 55) * Math.PI / 180) / 2);

    for (let y = 0; y < H; y++) {
      const lat = PI_HALF - (y + 0.5) / H * Math.PI;
      const theta = PI_HALF - lat;
      const r = 2 * R * Math.tan(theta / 2);
      for (let x = 0; x < W; x++) {
        const lon = (x + 0.5) / W * 2 * Math.PI + rot;
        const sx = cx + r * Math.cos(lon), sy = cy + r * Math.sin(lon);
        const x0 = Math.min(pw - 1, Math.max(0, sx | 0)), x1 = Math.min(pw - 1, x0 + 1);
        const y0 = Math.min(ph - 1, Math.max(0, sy | 0)), y1 = Math.min(ph - 1, y0 + 1);
        const fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
        const i00 = (y0 * pw + x0) * 4, i10 = (y0 * pw + x1) * 4;
        const i01 = (y1 * pw + x0) * 4, i11 = (y1 * pw + x1) * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const o4 = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          od[o4 + ch] =
            px[i00 + ch] * w00 + px[i10 + ch] * w10 +
            px[i01 + ch] * w01 + px[i11 + ch] * w11;
        }
        od[o4 + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    return out;
  }

  function build(root, state, requestRender) {
    const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };

    mk('p', { textContent: 'Punya panorama AI yang hasilnya berpilin/berpusar di satu titik? Unggah di sini, klik pusat pilinannya di pratinjau, atur skala sampai lurus, lalu kirim ke Konversi.', className: 'note', style: 'margin-top:0' }, root);

    const row = mk('div', { className: 'row' }, root);
    const inp = mk('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true }, row);
    const btnPick = mk('button', { type: 'button', textContent: 'Pilih gambar berpilin' }, row);
    btnPick.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => { if (inp.files[0]) loadFile(inp.files[0]); inp.value = ''; });

    // pratinjau + klik pusat
    const wrap = mk('div', { style: 'position:relative;max-width:640px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#04070f;margin-top:10px;cursor:crosshair' }, root);
    const pv = mk('canvas', { width: 640, height: 360, style: 'display:block;width:100%;height:auto' }, wrap);
    const marker = mk('div', { style: 'position:absolute;width:26px;height:26px;border:2px solid var(--accent-2);border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(53,220,255,.6);display:none' }, wrap);
    const hint = mk('div', { textContent: 'Klik di pratinjau untuk menandai pusat pilinan.', className: 'note' }, root);

    const ctl = mk('div', {}, root);
    const vals = { scale: 100, rot: 0, cover: 55 };
    function addS(key, label, min, max, val, unit) {
      const w = document.createElement('div'); w.className = 'slider';
      const uid = 'dw_' + key;
      const l = document.createElement('label'); l.htmlFor = uid; l.textContent = label;
      const o = document.createElement('output'); o.htmlFor = uid; o.textContent = val + unit;
      const i = document.createElement('input'); i.type = 'range'; i.id = uid; i.name = uid; i.min = min; i.max = max; i.step = 1; i.value = val;
      i.addEventListener('input', () => { o.textContent = Number(i.value) + unit; vals[key] = Number(i.value); schedule(); });
      w.appendChild(l); w.appendChild(o); w.appendChild(i);
      ctl.appendChild(w);
    }
    let src = null, sw = 0, sh = 0, cx = 0.5, cy = 0.5, busy = false, tok = 0;
    let timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(render, 260); }

    addS('scale', 'Skala radius', 20, 300, 100, '%');
    addS('rot', 'Putar arah', 0, 359, 0, '°');
    addS('cover', 'Cakupan langit', 20, 90, 55, '°');

    const rowBtn = mk('div', { className: 'row' }, root);
    const btnGo = mk('button', { type: 'button', className: 'primary', textContent: 'Buat Panorama & Kirim ke Konverter', disabled: true }, rowBtn);
    const st = mk('div', { textContent: '', role: 'status', style: 'min-height:20px;font-size:13px;color:var(--muted)' }, rowBtn);

    wrap.addEventListener('click', e => {
      const rect = pv.getBoundingClientRect();
      cx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      cy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      marker.style.display = 'block';
      marker.style.left = (cx * 100) + '%';
      marker.style.top = (cy * 100) + '%';
      if (src) schedule();
    });

    function loadFile(file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        src = img; sw = img.naturalWidth; sh = img.naturalHeight;
        pv.width = 640; pv.height = Math.max(2, Math.round(640 * sh / sw));
        pv.getContext('2d').drawImage(img, 0, 0, pv.width, pv.height);
        btnGo.disabled = false;
        st.textContent = sw + 'x' + sh + ' px siap. Tandai pusat pilinan, atur skala, lalu buat.';
      };
      img.onerror = () => { st.textContent = 'Gagal memuat gambar.'; };
      img.src = url;
    }

    async function render() {
      if (!src || busy) return;
      busy = true;
      const myTok = ++tok;
      st.textContent = 'Merender… (bisa 2-6 detik)';
      await new Promise(r => setTimeout(r, 30));
      try {
        const pano = buildPano(src, sw, sh, {
          cx, cy, scale: vals.scale / 100, rot: vals.rot, cover: vals.cover, width: 2048
        });
        if (myTok !== tok) { busy = false; return; }
        pv.width = 1024; pv.height = 512;
        pv.getContext('2d').drawImage(pano, 0, 0, 1024, 512);
        marker.style.display = 'none';
        st.textContent = 'Panorama siap! Tekan kirim, atau atur lagi.';
        btnGo.disabled = false;
        btnGo.__pano = pano;
      } catch (e) {
        st.textContent = 'Gagal: ' + e.message;
      }
      busy = false;
    }

    btnGo.addEventListener('click', () => {
      if (!btnGo.__pano) return;
      window.MainApp.loadPanorama(btnGo.__pano, 'Hasil De-swirl');
      st.textContent = 'Dikirim ke Konversi ✓';
    });

    build.tok = 0;
  }

  return { build, buildPano };
})();

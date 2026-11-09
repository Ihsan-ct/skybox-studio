"use strict";
// Batch Convert: proses banyak panorama sekaligus menjadi 6 sisi skybox (orientasi
// properti Roblox, sama dengan ekspor biasa) dan kumpulkan dalam satu ZIP — satu
// folder per skybox. Pengaturan warna/posisi/watermark yang aktif di studio ikut
// dipakai untuk semua item.
window.BatchConvert = (function () {
  const GL = window.GLConvert;
  const tick = () => new Promise(r => setTimeout(r, 16));

  function build(root, state, onDone) {
    const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };

    mk('p', { textContent: 'Unggah beberapa panorama 2:1 (atau gambar biasa — dikonversi otomatis) lalu proses semuanya menjadi ZIP berisi folder per skybox. Pengaturan warna, posisi, watermark, dan resolusi yang aktif dipakai untuk semua item.', className: 'note', style: 'margin-top:0' }, root);

    const rowTop = mk('div', { className: 'row' }, root);
    const inp = mk('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true }, rowTop);
    const btnPick = mk('button', { type: 'button', textContent: 'Pilih gambar (bisa banyak)' }, rowTop);
    btnPick.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => { addFiles(Array.from(inp.files || [])); inp.value = ''; });

    const listEl = mk('div', { style: 'display:grid;gap:6px;margin:10px 0' }, root);
    const statusEl = mk('div', { textContent: 'Belum ada gambar.', role: 'status', style: 'min-height:22px;font-size:13px;color:var(--muted)' }, root);

    const rowAct = mk('div', { className: 'row' }, root);
    const btnRun = mk('button', { type: 'button', className: 'primary', textContent: 'Proses semua', disabled: true }, rowAct);
    const btnDl = mk('button', { type: 'button', textContent: 'Unduh ZIP', disabled: true }, rowAct);
    const btnClear = mk('button', { type: 'button', textContent: 'Kosongkan daftar' }, rowAct);

    // Baris progres keseluruhan
    const barWrap = mk('div', { style: 'height:8px;border-radius:99px;background:var(--panel2);border:1px solid var(--line);overflow:hidden;margin-top:8px' }, root);
    const bar = mk('div', { style: 'height:100%;width:0%;background:var(--accent);transition:width .2s' }, barWrap);

    const items = [];   // { file, name, row, stEl, img }
    let zip = null, busy = false;

    function sanitizeName(s) {
      const v = String(s || '').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'Skybox';
      let n = v, i = 2;
      while (items.some(it => it.name === n)) n = v + '-' + (i++);
      return n;
    }

    function addFiles(files) {
      const imgs = files.filter(f => /^image\//i.test(f.type));
      if (!imgs.length) { statusEl.textContent = 'Tidak ada file gambar yang dikenali.'; return; }
      imgs.forEach(f => {
        const it = { file: f, name: sanitizeName(f.name), img: null };
        const r = mk('div', { className: 'row', style: 'justify-content:space-between;margin:0;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--panel2)' }, listEl);
        const lb = mk('span', { textContent: it.name + '  (' + f.name + ')', style: 'font-size:13px;word-break:break-all' }, r);
        it.stEl = mk('span', { textContent: 'Menunggu', style: 'font-size:12px;color:var(--muted);white-space:nowrap' }, r);
        it.row = r;
        items.push(it);
      });
      statusEl.textContent = items.length + ' gambar dalam daftar. Resolusi ekspor aktif: ' + state.exportRes + ' px.';
      btnRun.disabled = busy;
    }

    function setSt(it, text, color) {
      it.stEl.textContent = text;
      it.stEl.style.color = color || 'var(--muted)';
    }

    async function loadImage(file) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Gagal memuat ' + file.name)); img.src = url; });
        return img;
      } finally { URL.revokeObjectURL(url); }
    }

    async function renderFaceBlob(face, size, st) {
      GL.setSize(size);
      GL.drawFace(face, size, st);
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(GL.glCanvas, 0, 0);
      GL.applyWatermark(ctx, face.k, size, st);
      const out = GL.rotatedForRoblox(face.k, c);
      return new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png'));
    }

    async function restoreMainPreview() {
      if (state.image && state.image.source) {
        try { GL.uploadTexture(state.image.source); } catch (_) {}
      }
      if (onDone) onDone();
    }

    btnRun.addEventListener('click', async () => {
      if (busy || !items.length) return;
      busy = true; btnRun.disabled = true; btnPick.disabled = true; btnDl.disabled = true;
      let ok = 0, fail = 0;
      try {
        zip = new JSZip();
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const progress = (n) => { bar.style.width = Math.round(n / items.length * 100) + '%'; };
          try {
            setSt(it, 'Memuat…');
            it.img = await loadImage(it.file);
            let src = it.img, w = it.img.naturalWidth, h = it.img.naturalHeight;
            if (Math.abs(w / h - 2.0) / 2.0 > 0.05) {
              setSt(it, 'Konversi 2D → panorama…');
              await tick();
              src = window.Flat2Pano.convert(src, w, h, { fov: 100, pitch: 0, edge: 18, maxW: Math.min(4096, GL.getMaxTex()) });
              w = src.width; h = src.height;
            }
            GL.uploadTexture(src);
            setSt(it, 'Merender 6 sisi…');
            const folder = it.name + '/';
            for (const f of GL.FACES) {
              const blob = await renderFaceBlob(f, state.exportRes, state);
              zip.file(folder + 'Skybox' + GL.ROBLOX_PROPERTY[f.k] + '.png', blob);
            }
            setSt(it, 'Selesai ✓', 'var(--ok, #3ecf6f)');
            ok++;
          } catch (e) {
            setSt(it, 'Gagal: ' + e.message, '#e05b5b');
            fail++;
          }
          it.img = null;
          progress(i + 1);
          statusEl.textContent = 'Memproses ' + (i + 1) + '/' + items.length + ' …';
          await tick();
        }
        zip.file('CARA-PAKAI.txt',
          'Setiap folder = 1 skybox (nama folder = nama gambar asal).\n' +
          'Nama file di dalamnya = nama properti Sky Roblox (SkyboxFt, SkyboxBk, SkyboxLf, SkyboxRt, SkyboxUp, SkyboxDn).\n\n' +
          'Cara pakai:\n' +
          '1) Upload tiap folder: node upload-skybox.mjs <path-folder> --user-id <id kamu>\n' +
          '   (atau upload manual via Asset Manager di Studio)\n' +
          '2) Tempel 6 Image ID ke aplikasi web, lalu unduh script/sky .rbxmx.\n');
        statusEl.textContent = 'Selesai: ' + ok + ' berhasil' + (fail ? ', ' + fail + ' gagal' : '') + '. Tekan Unduh ZIP.';
        btnDl.disabled = ok === 0;
      } finally {
        busy = false; btnRun.disabled = !items.length; btnPick.disabled = false;
        await restoreMainPreview();
      }
    });

    btnDl.addEventListener('click', async () => {
      if (!zip) return;
      btnDl.disabled = true;
      statusEl.textContent = 'Menyusun ZIP…';
      try {
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        const url = URL.createObjectURL(blob);
        const a = mk('a', { href: url, download: 'SkyboxBatch_' + state.exportRes + '.zip' }, document.body);
        a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        statusEl.textContent = 'ZIP terunduh (' + (blob.size / 1048576).toFixed(1) + ' MB).';
      } catch (e) {
        statusEl.textContent = 'Gagal menyusun ZIP: ' + e.message;
      }
      btnDl.disabled = false;
    });

    btnClear.addEventListener('click', () => {
      if (busy) return;
      items.length = 0; listEl.textContent = ''; zip = null; bar.style.width = '0%';
      statusEl.textContent = 'Daftar dikosongkan.'; btnRun.disabled = true; btnDl.disabled = true;
    });
  }

  return { build };
})();

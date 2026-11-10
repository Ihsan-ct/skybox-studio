"use strict";
// Paket Langit Gratis: 6 langit contoh prosedural x 6 sisi = 36 PNG siap-upload,
// dibungkus satu ZIP dengan folder per langit + instruksi. Semua dirender lokal.
window.PaketLangit = (function () {
  const GL = window.GLConvert;
  const tick = () => new Promise(r => setTimeout(r, 16));

  const LABEL = {
    siang: 'Siang Cerah', senja: 'Senja', malam: 'Malam Berbintang',
    aurora: 'Aurora', nebula: 'Nebula', horor: 'Kabut Horor'
  };

  async function renderFaceBlob(face, size, state) {
    GL.setSize(size);
    GL.drawFace(face, size, state);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(GL.glCanvas, 0, 0);
    const out = GL.rotatedForRoblox(face.k, c);
    return new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/png'));
  }

  function build(root, state, setStatus) {
    const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };

    mk('p', { textContent: 'Bangun 36 PNG (6 langit contoh x 6 sisi) dalam satu ZIP — folder per langit, nama file = properti Roblox. Upload lewat Batch/CLI, lalu gabung ID-nya di Paket Ganti-Langit untuk dapat paket skybox seru gratis.', className: 'note', style: 'margin-top:0' }, root);

    const row = mk('div', { className: 'row' }, root);
    const btnBuild = mk('button', { type: 'button', className: 'primary', textContent: 'Bangun Paket Langit Gratis' }, row);
    const btnDl = mk('button', { type: 'button', textContent: 'Unduh ZIP', disabled: true }, row);
    const statusEl = mk('div', { textContent: 'Belum dibangun.', role: 'status', style: 'min-height:22px;margin-top:8px;font-size:13px;color:var(--muted)' }, root);
    const barWrap = mk('div', { style: 'height:8px;border-radius:99px;background:var(--panel2);border:1px solid var(--line);overflow:hidden;margin-top:8px' }, root);
    const bar = mk('div', { style: 'height:100%;width:0%;background:var(--accent);transition:width .2s' }, barWrap);

    let busy = false;

    btnBuild.addEventListener('click', async () => {
      if (busy) return;
      busy = true; btnBuild.disabled = true; btnDl.disabled = true;
      const kinds = window.SampleSkies.kinds;
      const total = kinds.length * 6;
      let done = 0;
      try {
        const zip = new JSZip();
        const keep = state.image ? state.image.source : null;
        for (let ki = 0; ki < kinds.length; ki++) {
          const kind = kinds[ki];
          const label = LABEL[kind] || kind;
          statusEl.textContent = 'Merender ' + label + '… (' + (ki + 1) + '/' + kinds.length + ')';
          const pano = window.SampleSkies.make(kind);
          const st = Object.assign({}, state, { image: { source: pano, width: pano.width, height: pano.height, name: label } });
          GL.uploadTexture(pano);
          const folder = 'Langit ' + (ki + 1) + ' - ' + label + '/';
          for (const f of GL.FACES) {
            const blob = await renderFaceBlob(f, state.exportRes, st);
            zip.file(folder + 'Skybox' + GL.ROBLOX_PROPERTY[f.k] + '.png', blob);
            done++; bar.style.width = Math.round(done / total * 100) + '%';
            await tick();
          }
          await tick();
        }
        zip.file('CARA-PAKAI.txt',
          'NAKA STUDIO - PAKET LANGIT GRATIS\n' +
          '==================================\n\n' +
          'Isi: ' + kinds.length + ' folder (1 folder = 1 langit), masing-masing 6 PNG\n' +
          '(nama file = properti Sky Roblox: SkyboxFt/Bk/Lf/Rt/Up/Dn).\n\n' +
          'Cara cepat:\n' +
          '1) Upload tiap folder: node upload-skybox.mjs "<folder>" --user-id <id kamu>\n' +
          '2) Kumpulkan 6 ID per folder, lalu di NAKA Studio bagian Roblox,\n' +
          '   pakai "Paket Ganti-Langit" untuk membuat script pemasang otomatis.\n\n' +
          'Selamat berkarya - NAKA Studio\n');
        statusEl.textContent = 'Selesai! ' + total + ' PNG dirender. Tekan Unduh ZIP.';
        btnDl.disabled = false;
        btnDl.onclick = async () => {
          btnDl.disabled = true;
          statusEl.textContent = 'Menyusun ZIP…';
          try {
            const blob2 = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
            const url = URL.createObjectURL(blob2);
            const a = mk('a', { href: url, download: 'NAKA-LangitGratis.zip' }, document.body);
            a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            statusEl.textContent = 'ZIP terunduh (' + (blob2.size / 1048576).toFixed(1) + ' MB).';
          } catch (e) { statusEl.textContent = 'Gagal menyusun ZIP: ' + e.message; }
          btnDl.disabled = false;
        };
      } catch (e) {
        statusEl.textContent = 'Gagal: ' + e.message;
      } finally {
        busy = false; btnBuild.disabled = false;
        // pulihkan tekstur preview utama
        if (state.image && state.image.source) { try { GL.uploadTexture(state.image.source); } catch (e) {} }
        if (window.MainApp && window.MainApp.refreshPreview) window.MainApp.refreshPreview();
      }
    });
  }

  return { build };
})();

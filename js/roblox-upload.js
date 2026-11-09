"use strict";
window.RobloxUpload = (function () {
  const FACES = window.GLConvert.FACES;
  const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let apiKeyInp, ownerTypeSel, ownerIdInp, namePrefixInp, typeSel, btnUpload, logEl;
  const rows = {};

  function log(msg) {
    const p = document.createElement('div');
    p.textContent = msg;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setRowStatus(k, text, ok) {
    const r = rows[k];
    r.status.textContent = text;
    r.status.className = 'rbx-status' + (ok ? ' ok' : '');
  }

  const LIMIT = 4.2 * 1024 * 1024; // di bawah batas body Vercel (4,5 MB)
  const done = {}, pending = {};    // sisi -> assetId / operation path, supaya bisa lanjut setelah gagal
  let doneType = null, lastSig = '';

  function resetProgress() {
    FACES.forEach(f => { delete done[f.k]; delete pending[f.k]; setRowStatus(f.k, 'Belum diunggah', false); });
    doneType = null; lastSig = '';
  }

  async function renderFacePng(face, size, state) {
    const GL = window.GLConvert;
    GL.setSize(size);
    GL.drawFace(face, size, state);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(GL.glCanvas, 0, 0);
    GL.applyWatermark(ctx, face.k, size, state);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob menghasilkan null')), 'image/png'));
  }

  // Perkecil resolusi bertahap kalau PNG melewati batas body Vercel.
  async function fitFacePng(face, size, state) {
    let blob = await renderFacePng(face, size, state);
    while (blob.size > LIMIT && size > 512) {
      size = Math.max(512, Math.floor(size * 0.8 / 64) * 64);
      blob = await renderFacePng(face, size, state);
    }
    if (blob.size > LIMIT) throw new Error('PNG Skybox' + face.k + ' masih ' + (blob.size / 1048576).toFixed(1) + ' MB di 512px. Pakai upload-skybox.mjs via terminal.');
    return { blob, size };
  }

  async function createAsset(apiKey, type, name, ownerType, ownerId, blob) {
    const qs = new URLSearchParams({ type, name, ownerType, ownerId });
    const r = await fetch('/api/roblox-create?' + qs.toString(), {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'image/png' },
      body: blob
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = r.status === 413 ? 'Gambar terlalu besar untuk proxy (batas 4,5 MB).' : (j.error || ('HTTP ' + r.status));
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return j.path;
  }

  async function pollOperation(apiKey, path) {
    for (let i = 0; i < 40; i++) {
      await sleep(i === 0 ? 1200 : 1800);
      const r = await fetch('/api/roblox-poll?path=' + encodeURIComponent(path), { headers: { 'x-api-key': apiKey } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      if (j.done) {
        if (j.error) throw new Error('Ditolak Roblox: ' + j.error);
        if (j.assetId) return j.assetId;
        throw new Error('Operasi selesai tanpa assetId.');
      }
    }
    throw new Error('Waktu tunggu habis (mungkin masih dalam moderasi). Tekan Upload lagi untuk melanjutkan mengecek ' + path + '.');
  }

  async function run(state, onIdsUpdated) {
    const apiKey = apiKeyInp.value.trim();
    const ownerType = ownerTypeSel.value;
    const ownerId = ownerIdInp.value.trim();
    const base = (namePrefixInp.value.trim() || 'Skybox').replace(/[^\w\- ]/g, '').slice(0, 40) || 'Skybox';

    if (!apiKey) { log('API Key wajib diisi.'); return; }
    if (!/^\d+$/.test(ownerId)) { log('User ID / Group ID harus berupa angka.'); return; }
    if (!state.image) { log('Belum ada gambar skybox untuk diunggah. Unggah panorama dulu di tab Preview Cross.'); return; }

    const sig = ownerType + ':' + ownerId + ':' + base;
    if (sig !== lastSig) { resetProgress(); lastSig = sig; }
    let type = doneType || (typeSel.value === 'auto' ? 'Image' : typeSel.value);

    btnUpload.disabled = true;
    FACES.forEach(f => { if (!done[f.k]) setRowStatus(f.k, 'Menunggu…', false); });
    log('Mulai mengunggah ' + base + '_* (' + type + ', ' + state.exportRes + 'px)…');

    try {
      for (const f of FACES) {
        if (done[f.k]) { log('Skybox' + f.k + ' sudah terunggah (' + done[f.k] + '), dilewati.'); continue; }
        let path = pending[f.k];
        if (!path) {
          setRowStatus(f.k, 'Merender…', false);
          const { blob, size } = await fitFacePng(f, state.exportRes, state);
          if (size !== state.exportRes) log('Skybox' + f.k + ' diperkecil ke ' + size + 'px agar muat batas 4,5 MB.');
          const name = base + '_' + f.k;
          setRowStatus(f.k, 'Mengunggah…', false);
          try {
            path = await createAsset(apiKey, type, name, ownerType, ownerId, blob);
          } catch (e) {
            if (e.status === 400 && typeSel.value === 'auto' && type === 'Image' && !doneType) {
              type = 'Decal';
              log('Permintaan Image ditolak (400); mencoba Decal…');
              path = await createAsset(apiKey, type, name, ownerType, ownerId, blob);
            } else throw e;
          }
          doneType = type;
          pending[f.k] = path;
        }
        setRowStatus(f.k, 'Diproses Roblox…', false);
        const assetId = await pollOperation(apiKey, path);
        done[f.k] = assetId; delete pending[f.k];
        setRowStatus(f.k, 'ID ' + assetId, true);
        log('Skybox' + f.k + ' -> ' + assetId);
        state.ids[f.k] = assetId;
        const inp = document.getElementById('id_' + f.k);
        if (inp) inp.value = assetId;
        if (onIdsUpdated) onIdsUpdated();
      }

      log('Selesai! Semua 6 sisi terunggah sebagai ' + type + '.');
      if (type === 'Decal') {
        log('Catatan: aset berupa Decal. Kalau skybox tampil putih di game, ambil Image ID dari Asset Manager di Studio.');
      }
      resetProgressKeepRows();
    } catch (e) {
      log('Gagal: ' + e.message);
      log('Sisi yang sudah berhasil tetap tersimpan; tekan Upload lagi untuk melanjutkan (atau "Mulai dari awal").');
      if (/404/.test(e.message) || /Unexpected token/.test(e.message)) {
        log('Catatan: fitur ini butuh backend serverless (/api). Kalau situs ini di-deploy di GitHub Pages (statis murni), fitur upload langsung tidak akan berfungsi — pakai skrip upload-skybox.mjs via terminal sebagai gantinya.');
      }
    } finally {
      btnUpload.disabled = false;
    }
  }

  // Setelah sukses penuh: upload berikutnya mulai bersih, tapi status ID di kartu tetap terlihat.
  function resetProgressKeepRows() {
    FACES.forEach(f => { delete done[f.k]; delete pending[f.k]; });
    doneType = null; lastSig = '';
  }

  function build(root, state, onIdsUpdated) {
    const det = mk('details', { className: 'group', open: true }, root);
    const sum = mk('summary', { textContent: 'Upload Langsung ke Roblox (Open Cloud)' }, det);

    const note = mk('p', { className: 'note' }, det);
    note.innerHTML = 'Butuh <a href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noopener">Open Cloud API Key</a> dengan permission <strong>Add assets</strong>. API key dikirim ke endpoint proyek ini (<code>/api/roblox-create</code>), diteruskan langsung ke Roblox, dan tidak disimpan di server maupun di browser. Fitur ini butuh backend (jalan di Vercel), tidak jalan di hosting statis murni seperti GitHub Pages.';

    const f1 = mk('div', { className: 'field' }, det);
    mk('label', { textContent: 'API Key' }, f1);
    apiKeyInp = mk('input', { type: 'password', placeholder: 'Open Cloud API Key', autocomplete: 'off' }, f1);

    const row1 = mk('div', { className: 'row' }, det);
    ownerTypeSel = mk('select', {}, row1); ownerTypeSel.style.cssText = 'min-height:44px;border-radius:8px';
    mk('option', { value: 'user', textContent: 'Milik User' }, ownerTypeSel);
    mk('option', { value: 'group', textContent: 'Milik Group' }, ownerTypeSel);
    ownerIdInp = mk('input', { type: 'text', inputMode: 'numeric', placeholder: 'User ID / Group ID' }, row1);

    const row2 = mk('div', { className: 'row' }, det);
    namePrefixInp = mk('input', { type: 'text', placeholder: 'Nama awalan (default: Skybox)' }, row2);
    typeSel = mk('select', {}, row2); typeSel.style.cssText = 'min-height:44px;border-radius:8px';
    mk('option', { value: 'auto', textContent: 'Tipe: Otomatis (coba Image, fallback Decal)' }, typeSel);
    mk('option', { value: 'Image', textContent: 'Tipe: Image' }, typeSel);
    mk('option', { value: 'Decal', textContent: 'Tipe: Decal' }, typeSel);

    const grid = mk('div', {}, det);
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin:10px 0';
    FACES.forEach(f => {
      const cell = mk('div', {}, grid);
      cell.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px;background:var(--panel2)';
      mk('strong', { textContent: 'Skybox' + f.k }, cell);
      const status = mk('div', { textContent: 'Belum diunggah', className: 'rbx-status' }, cell);
      rows[f.k] = { status };
    });

    btnUpload = mk('button', { type: 'button', className: 'primary', textContent: 'Upload ke Roblox' }, det);
    btnUpload.style.marginTop = '4px';
    btnUpload.addEventListener('click', () => run(state, onIdsUpdated));
    const btnReset = mk('button', { type: 'button', textContent: 'Mulai dari awal' }, det);
    btnReset.style.cssText = 'margin:4px 0 0 8px';
    btnReset.addEventListener('click', () => { resetProgress(); log('Progres direset; upload berikutnya mengunggah ke-6 sisi dari awal.'); });

    logEl = mk('div', { className: 'rbx-log' }, det);
  }

  return { build };
})();

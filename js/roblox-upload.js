"use strict";
window.RobloxUpload = (function () {
  const FACES = window.GLConvert.FACES;
  const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let apiKeyInp, ownerTypeSel, ownerIdInp, namePrefixInp, typeSel, btnUpload, logEl, vaultSel, vaultNameInp, vaultPassInp;
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

  // ---- Brankas akun: disimpan di localStorage browser ini saja (tidak pernah dikirim ke server) ----
  const STORE = 'rsk.profiles', LAST = 'rsk.last';
  const b64 = u => btoa(String.fromCharCode(...u));
  const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const loadProfiles = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } };
  const saveProfiles = list => { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (e) { return false; } };

  async function aesKey(pass, salt) {
    const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(text, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(pass, salt), new TextEncoder().encode(text));
    return { salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ct)) };
  }
  async function decrypt(enc, pass) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, await aesKey(pass, unb64(enc.salt)), unb64(enc.data));
    return new TextDecoder().decode(pt);
  }

  function build(root, state, onIdsUpdated) {
    const det = mk('details', { className: 'group', open: true }, root);
    const sum = mk('summary', { textContent: 'Upload Langsung ke Roblox (Open Cloud)' }, det);

    const note = mk('p', { className: 'note' }, det);
    note.innerHTML = 'Butuh <a href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noopener">Open Cloud API Key</a> dengan permission <strong>Assets</strong> (Read + Write). API key dikirim ke endpoint proyek ini (<code>/api/roblox-create</code>), diteruskan langsung ke Roblox, dan tidak disimpan di server. Di browser, key hanya tersimpan kalau kamu menekan <strong>Simpan akun</strong>. Fitur ini butuh backend (jalan di Vercel), tidak jalan di hosting statis murni seperti GitHub Pages.';

    // Akun tersimpan
    const vb = mk('div', {}, det);
    vb.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0;background:var(--panel2)';
    mk('strong', { textContent: 'Akun tersimpan' }, vb);
    const vrow1 = mk('div', { className: 'row' }, vb);
    vaultSel = mk('select', {}, vrow1); vaultSel.style.cssText = 'min-height:44px;border-radius:8px';
    const btnUse = mk('button', { type: 'button', textContent: 'Pakai' }, vrow1);
    const btnDel = mk('button', { type: 'button', textContent: 'Hapus' }, vrow1);
    const vrow2 = mk('div', { className: 'row' }, vb);
    vaultNameInp = mk('input', { type: 'text', placeholder: 'Nama akun (mis. Akun Utama)' }, vrow2);
    vaultPassInp = mk('input', { type: 'password', placeholder: 'Kata sandi brankas (disarankan)', autocomplete: 'off' }, vrow2);
    const btnSave = mk('button', { type: 'button', className: 'primary', textContent: 'Simpan akun' }, vrow2);
    mk('p', { className: 'note', textContent: 'Isi form di bawah, beri nama, lalu Simpan akun. Dengan kata sandi, API key dienkripsi (AES-GCM) di browser ini; kata sandi dipakai lagi saat menekan Pakai. Tanpa kata sandi, key tersimpan sebagai teks biasa di browser ini.' }, vb);

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

    function refreshVault(selectId) {
      const list = loadProfiles();
      vaultSel.textContent = '';
      mk('option', { value: '', textContent: list.length ? 'Pilih akun…' : 'Belum ada akun tersimpan' }, vaultSel);
      list.forEach(p => mk('option', { value: p.id, textContent: p.label + (p.enc ? ' 🔒' : '') }, vaultSel));
      if (selectId) vaultSel.value = selectId;
    }
    function fill(p) {
      ownerTypeSel.value = p.ownerType; ownerIdInp.value = p.ownerId;
      namePrefixInp.value = p.prefix || ''; typeSel.value = p.type || 'auto';
      vaultNameInp.value = p.label;
    }
    async function useProfile(id) {
      const p = loadProfiles().find(x => x.id === id);
      if (!p) { log('Pilih akun dulu.'); return; }
      fill(p);
      try {
        if (p.enc) {
          if (!vaultPassInp.value) { log('Akun "' + p.label + '" terenkripsi: isi kata sandi brankas lalu tekan Pakai.'); return; }
          apiKeyInp.value = await decrypt(p.enc, vaultPassInp.value);
        } else apiKeyInp.value = p.key || '';
        localStorage.setItem(LAST, p.id);
        log('Akun "' + p.label + '" dipakai.');
      } catch (e) { log('Kata sandi salah atau data rusak.'); }
    }
    btnUse.addEventListener('click', () => useProfile(vaultSel.value));
    btnDel.addEventListener('click', () => {
      const id = vaultSel.value; if (!id) { log('Pilih akun yang mau dihapus.'); return; }
      saveProfiles(loadProfiles().filter(p => p.id !== id));
      try { if (localStorage.getItem(LAST) === id) localStorage.removeItem(LAST); } catch (e) {}
      refreshVault(); log('Akun dihapus dari browser ini.');
    });
    btnSave.addEventListener('click', async () => {
      const label = vaultNameInp.value.trim().slice(0, 40);
      const key = apiKeyInp.value.trim(), ownerId = ownerIdInp.value.trim();
      if (!label) { log('Beri nama akun dulu.'); return; }
      if (!key) { log('API Key kosong; isi dulu sebelum menyimpan.'); return; }
      if (!/^\d+$/.test(ownerId)) { log('User ID / Group ID harus berupa angka.'); return; }
      const pass = vaultPassInp.value;
      if (!pass && !confirm('Tanpa kata sandi, API key disimpan sebagai teks biasa di browser ini. Lanjutkan?')) return;
      const p = { id: '', label, ownerType: ownerTypeSel.value, ownerId, prefix: namePrefixInp.value.trim(), type: typeSel.value };
      try { if (pass) p.enc = await encrypt(key, pass); else p.key = key; }
      catch (e) { log('Enkripsi gagal (butuh HTTPS): ' + e.message); return; }
      const list = loadProfiles(), old = list.find(x => x.label === label);
      p.id = old ? old.id : String(Date.now());
      if (!saveProfiles(old ? list.map(x => x.id === old.id ? p : x) : list.concat(p))) { log('Gagal menyimpan (penyimpanan browser tidak tersedia).'); return; }
      try { localStorage.setItem(LAST, p.id); } catch (e) {}
      refreshVault(p.id); log('Akun "' + label + '" disimpan' + (pass ? ' (terenkripsi).' : ' (tanpa enkripsi).'));
    });

    let last = null; try { last = localStorage.getItem(LAST); } catch (e) {}
    refreshVault(last);
    const lp = loadProfiles().find(x => x.id === last);
    if (lp) { if (lp.enc) { fill(lp); log('Akun "' + lp.label + '" tersimpan. Isi kata sandi brankas lalu tekan Pakai.'); } else useProfile(lp.id); }
  }

  return { build };
})();

"use strict";
window.RobloxUpload = (function () {
  const GL = window.GLConvert;
  const FACES = GL.FACES;
  // Upload dan ID selalu memakai nama PROPERTI Roblox (SkyboxFt…SkyboxDn).
  // Gambar properti SkyboxRt dirender dari sisi kiri dan SkyboxLf dari sisi kanan
  // (konvensi Roblox, lihat catatan di gl-convert.js); Up/Dn diputar otomatis.
  const PROP_KEYS = ['Ft', 'Bk', 'Lf', 'Rt', 'Up', 'Dn'];
  const FACE_FOR_PROP = {};
  FACES.forEach(f => { FACE_FOR_PROP[GL.ROBLOX_PROPERTY[f.k]] = f; });
  const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let prefixAuto = '', pendingSuggest = '', running = false;
  let apiKeyInp, ownerTypeSel, ownerIdInp, namePrefixInp, typeSel, btnUpload, logEl, vaultSel, vaultNameInp, vaultPassInp, rememberChk, autoSave;
  const rows = {};

  // ── Mode OAuth Roblox (jalur cepat tanpa API key) ──
  let oauthBox, oauthLine, oauthBtnLogin, oauthBtnLogout;
  let oauthAcc = null;   // { loggedIn, name, picture, userId } | { loggedIn:false }

  function log(msg) {
    const p = document.createElement('div');
    p.textContent = msg;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setBusy(b) {
    if (btnUpload) btnUpload.disabled = b;
    PROP_KEYS.forEach(k => { if (rows[k] && rows[k].retry) rows[k].retry.disabled = b; });
  }
  function setRetry(k, show) { if (rows[k] && rows[k].retry) rows[k].retry.hidden = !show; }

  function setRowStatus(k, text, ok) {
    const r = rows[k];
    r.status.textContent = text;
    r.status.className = 'rbx-status' + (ok ? ' ok' : '');
  }

  const LIMIT = 4.2 * 1024 * 1024; // di bawah batas body Vercel (4,5 MB)
  const done = {}, pending = {};    // sisi -> assetId / operation path, supaya bisa lanjut setelah gagal
  let doneType = null, lastSig = '';

  function resetProgress() {
    PROP_KEYS.forEach(k => { delete done[k]; delete pending[k]; setRowStatus(k, 'Belum diunggah', false); setRetry(k, false); });
    doneType = null; lastSig = '';
  }

  // Awalan nama aset otomatis dari nama file gambar (hanya kalau pengguna belum mengetik sendiri).
  function suggestPrefix(fileName) {
    const v = String(fileName || '').replace(/\.[^.]+$/, '').replace(/\s*\[[^\]]*\]\s*$/, '')
      .replace(/\s+/g, '-').replace(/[^\w\-]/g, '').replace(/^-+|-+$/g, '').slice(0, 30);
    if (!v) return;
    if (!namePrefixInp) { pendingSuggest = v; return; }
    if (namePrefixInp.value.trim() === '' || namePrefixInp.value === prefixAuto) { namePrefixInp.value = v; prefixAuto = v; }
  }

  async function renderFacePng(face, size, state) {
    GL.setSize(size);
    GL.drawFace(face, size, state);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(GL.glCanvas, 0, 0);
    GL.applyWatermark(ctx, face.k, size, state);
    // Ubah ke orientasi properti Roblox terkait (Up 90° CCW, Dn 90° CW, lainnya utuh).
    return new Promise((res, rej) => GL.rotatedForRoblox(face.k, c).toBlob(b => b ? res(b) : rej(new Error('toBlob menghasilkan null')), 'image/png'));
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

  // ── Jalur OAuth (token disimpan di server, terikat sesi situs) ──
  async function oauthUpload(type, name, blob) {
    const qs = new URLSearchParams({ type, name });
    const r = await fetch('/api/rbx-oauth/upload?' + qs.toString(), {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = r.status === 413 ? 'Gambar terlalu besar untuk proxy (batas 4,5 MB).' : (j.error || ('HTTP ' + r.status));
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return j.path;
  }

  async function oauthPoll(path) {
    for (let i = 0; i < 40; i++) {
      await sleep(i === 0 ? 1200 : 1800);
      const r = await fetch('/api/rbx-oauth/poll?path=' + encodeURIComponent(path));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      if (j.done) {
        if (j.error) throw new Error('Ditolak Roblox: ' + j.error);
        if (j.assetId) return { assetId: String(j.assetId), moderation: j.moderation || null };
        throw new Error('Operasi selesai tanpa assetId.');
      }
    }
    throw new Error('Waktu tunggu habis (mungkin masih dalam moderasi). Tekan Upload lagi untuk melanjutkan.');
  }

  const FATAL = [401, 403, 429];

  const useOauth = () => !!(oauthAcc && oauthAcc.loggedIn);

  // only: kunci satu properti (mis. 'Rt') untuk mencoba ulang sisi itu saja.
  async function run(state, onIdsUpdated, only) {
    const apiKey = apiKeyInp ? apiKeyInp.value.trim() : '';
    const ownerType = ownerTypeSel ? ownerTypeSel.value : 'user';
    const ownerId = ownerIdInp ? ownerIdInp.value.trim() : '';
    const base = ((namePrefixInp && namePrefixInp.value.trim()) || 'Skybox').replace(/[^\w\- ]/g, '').slice(0, 40) || 'Skybox';
    const oauth = useOauth();

    if (!oauth && !apiKey) { log('API Key wajib diisi (atau pakai "Login pakai Roblox" di atas).'); return; }
    if (!oauth && !/^\d+$/.test(ownerId)) { log('User ID / Group ID harus berupa angka.'); return; }
    if (!state.image) { log('Belum ada gambar skybox untuk diunggah. Unggah panorama dulu di tab Konversi.'); return; }
    if (running) return;

    const sig = (oauth ? 'oauth:' + (oauthAcc.userId || '') : ownerType + ':' + ownerId) + ':' + base;
    if (sig !== lastSig) { resetProgress(); lastSig = sig; }
    let type = doneType || (typeSel && typeSel.value === 'auto' ? 'Image' : (typeSel ? typeSel.value : 'Image'));

    let saved = false;
    if (!only && !Object.keys(done).length && !Object.keys(pending).length) {   // upload baru: sembunyikan script lama
      state.uploadType = null;
      PROP_KEYS.forEach(k => { state.ids[k] = ''; const i = document.getElementById('id_' + k); if (i) i.value = ''; });
      if (onIdsUpdated) onIdsUpdated();
    }
    running = true; setBusy(true);
    const targets = only ? PROP_KEYS.filter(k => k === only) : PROP_KEYS;
    targets.forEach(k => { if (!done[k]) setRowStatus(k, 'Menunggu…', false); });
    log((only ? 'Mencoba ulang Skybox' + only : 'Mulai mengunggah ' + base + '_*') + ' (' + type + ', ' + state.exportRes + 'px, jalur ' + (oauth ? 'OAuth' : 'API key') + ')…');

    const failed = {};
    try {
      for (const k of targets) {
        if (done[k]) { log('Skybox' + k + ' sudah terunggah (' + done[k] + '), dilewati.'); continue; }
        try {
          let path = pending[k];
          if (!path) {
            const f = FACE_FOR_PROP[k];
            setRowStatus(k, 'Merender…', false);
            const { blob, size } = await fitFacePng(f, state.exportRes, state);
            if (size !== state.exportRes) log('Skybox' + k + ' diperkecil ke ' + size + 'px agar muat batas 4,5 MB.');
            const name = base + '_' + k;
            setRowStatus(k, 'Mengunggah…', false);
            try {
              path = oauth ? await oauthUpload(type, name, blob) : await createAsset(apiKey, type, name, ownerType, ownerId, blob);
            } catch (e) {
              if (e.status === 400 && (!typeSel || typeSel.value === 'auto') && type === 'Image' && !doneType) {
                type = 'Decal';
                log('Permintaan Image ditolak (400); mencoba Decal…');
                path = oauth ? await oauthUpload(type, name, blob) : await createAsset(apiKey, type, name, ownerType, ownerId, blob);
              } else throw e;
            }
            doneType = type;
            pending[k] = path;
          }
          setRowStatus(k, 'Diproses Roblox…', false);
          let assetId, moderation = null;
          try {
            if (oauth) {
              const r = await oauthPoll(path);
              assetId = r.assetId; moderation = r.moderation;
            } else {
              assetId = await pollOperation(apiKey, path);
            }
          } catch (e) { if (/Ditolak Roblox/.test(e.message)) delete pending[k]; throw e; }   // ditolak: render ulang saat dicoba lagi
          done[k] = assetId; delete pending[k];
          if (!saved && autoSave) { saved = true; try { await autoSave(); } catch (e) {} }
          const modPending = moderation && !/APPROVED/i.test(moderation);
          setRowStatus(k, 'ID ' + assetId + (modPending ? ' (moderasi…)' : ''), true);
          setRetry(k, false);
          log('Skybox' + k + ' -> ' + assetId + (modPending ? ' — masih dicek moderasi Roblox, langit muncul setelah lolos.' : ''));
          state.ids[k] = assetId;
          const inp = document.getElementById('id_' + k);
          if (inp) inp.value = assetId;
          if (onIdsUpdated) onIdsUpdated();
        } catch (e) {
          failed[k] = e;
          setRowStatus(k, 'Gagal', false);
          setRetry(k, true);
          log('Skybox' + k + ' gagal: ' + e.message);
          if (FATAL.includes(e.status)) { log('Dihentikan: masalah API key / izin / kuota, bukan hanya satu sisi.'); break; }
        }
      }

      const missing = PROP_KEYS.filter(k => !done[k]);
      if (!missing.length) {
        state.uploadType = type;
        if (onIdsUpdated) onIdsUpdated();
        log('Selesai! Semua 6 sisi terunggah sebagai ' + type + '.');
        if (type === 'Decal') {
          log('Catatan: aset berupa Decal. Kalau skybox tampil putih di game, ambil Image ID dari Asset Manager di Studio.');
        }
        // Auto-rbxmx: begitu selesai, file Sky langsung diunduh tanpa klik kedua.
        try {
          const cel = document.getElementById('celestial');
          const xml = window.LuauGen.buildRbxmx(state.ids, cel ? cel.checked : true);
          const a = document.createElement('a');
          const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
          a.href = url; a.download = 'Sky.rbxmx';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          log('File Sky.rbxmx terunduh otomatis — drag ke Roblox Studio (atau klik kanan Lighting > Insert From File).');
        } catch (e) {
          log('Unduh file Sky.rbxmx lewat tombol di bagian hasil.');
        }
        window.Vault.addHistory({ t: Date.now(), base, type, ownerId: oauth ? (oauthAcc.userId || '') : ownerId, ids: Object.assign({}, state.ids) });
        resetProgressKeepRows();
      } else if (Object.keys(failed).length) {
        log(missing.length + ' sisi belum selesai (' + missing.join(', ') + '). Tekan "Coba lagi" di sisi yang gagal, atau Upload untuk mengulang semuanya yang tersisa.');
        const msgs = Object.values(failed).map(e => e.message).join(' ');
        if (/404/.test(msgs) || /Unexpected token/.test(msgs)) {
          log('Catatan: fitur ini butuh backend serverless (/api). Kalau situs ini di-deploy di GitHub Pages (statis murni), fitur upload langsung tidak akan berfungsi — pakai skrip upload-skybox.mjs via terminal sebagai gantinya.');
        }
      }
    } finally {
      running = false; setBusy(false);
    }
  }

  // Setelah sukses penuh: upload berikutnya mulai bersih, tapi status ID di kartu tetap terlihat.
  function resetProgressKeepRows() {
    PROP_KEYS.forEach(k => { delete done[k]; delete pending[k]; });
    doneType = null; lastSig = '';
  }

  const { loadProfiles, saveProfiles, encrypt, decrypt } = window.Vault;

  function build(root, state, onIdsUpdated) {
    // ── Langkah 1 · Masuk & Akun ──
    const s1 = mk('details', { className: 'group', open: true }, root);
    mk('summary', { textContent: '1 · Masuk & Akun' }, s1);

    // Jalur cepat: OAuth Roblox (aktif kalau server dikonfigurasi).
    oauthBox = mk('div', { style: 'border:1px solid var(--accent);border-radius:10px;padding:10px 12px;background:var(--panel2);margin:6px 0 10px' }, s1);
    oauthBox.hidden = true;
    mk('strong', { textContent: 'Cara cepat — Login pakai Roblox' }, oauthBox);
    mk('p', { className: 'note', textContent: 'Login dengan akun Roblox resmi (password tidak lewat situs ini), lalu 6 sisi diunggah langsung ke akun kamu — tanpa API key, tanpa User ID.', style: 'margin:6px 0' }, oauthBox);
    const oauthRow = mk('div', { className: 'row' }, oauthBox);
    oauthBtnLogin = mk('button', { type: 'button', className: 'primary', textContent: 'Login pakai Roblox' }, oauthRow);
    oauthBtnLogout = mk('button', { type: 'button', textContent: 'Keluar', hidden: true }, oauthRow);
    oauthLine = mk('span', { textContent: '', style: 'font-size:13px;color:var(--muted)' }, oauthRow);
    oauthBtnLogin.addEventListener('click', () => { location.href = '/api/rbx-oauth/login'; });
    oauthBtnLogout.addEventListener('click', async () => {
      try { await fetch('/api/rbx-oauth/logout', { method: 'POST' }); } catch (e) {}
      oauthAcc = null; renderOauth(); log('Sesi Roblox diputus.');
    });

    // Gerbang login situs (Google/Discord) — API key butuh sesi ini.
    const gate = mk('div', { className: 'card' }, s1);
    mk('p', { textContent: 'Masuk dulu (Google/Discord) untuk mengunggah ke Roblox lewat situs ini — atau pakai "Login pakai Roblox" di atas. Konversi panorama, preview, dan ekspor ZIP tetap bebas tanpa masuk.' }, gate);
    const gb = mk('div', { className: 'row' }, gate); window.Auth.buttons(gb, false);

    // Isi akun (terlihat setelah masuk): vault ringkas + API key + owner.
    const acc = mk('div', {}, s1);
    acc.hidden = true;
    mk('p', { className: 'note', textContent: 'Butuh Open Cloud API Key dengan permission Assets (Read + Write), dibuat di Creator Dashboard. Key diingat otomatis (terenkripsi) setelah upload pertama berhasil. Jalur "Login pakai Roblox" di atas tidak butuh bagian ini.', style: 'margin-top:0' }, acc);
    const vb = mk('div', {}, acc);
    vb.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0;background:var(--panel2)';
    mk('strong', { textContent: 'Akun tersimpan' }, vb);
    const vrow1 = mk('div', { className: 'row' }, vb);
    vaultSel = mk('select', {}, vrow1); vaultSel.style.cssText = 'min-height:44px;border-radius:8px';
    const btnUse = mk('button', { type: 'button', textContent: 'Pakai' }, vrow1);
    const vrow2 = mk('div', { className: 'row' }, vb);
    vaultNameInp = mk('input', { type: 'text', placeholder: 'Nama akun (mis. Akun Utama)' }, vrow2);
    vaultPassInp = mk('input', { type: 'password', placeholder: 'Kata sandi (opsional)', autocomplete: 'off' }, vrow2);
    const btnSave = mk('button', { type: 'button', className: 'primary', textContent: 'Simpan akun' }, vrow2);
    const remLbl = mk('label', {}, vb); remLbl.style.cssText = 'display:flex;gap:6px;align-items:center;margin:6px 0';
    rememberChk = mk('input', { type: 'checkbox', checked: true }, remLbl);
    mk('span', { textContent: 'Ingat API key di browser ini (otomatis tersimpan setelah upload pertama berhasil)' }, remLbl);

    const f1 = mk('div', { className: 'field' }, acc);
    mk('label', { textContent: 'API Key' }, f1);
    apiKeyInp = mk('input', { type: 'password', placeholder: 'Open Cloud API Key', autocomplete: 'off' }, f1);

    const row1 = mk('div', { className: 'row' }, acc);
    ownerTypeSel = mk('select', {}, row1); ownerTypeSel.style.cssText = 'min-height:44px;border-radius:8px';
    mk('option', { value: 'user', textContent: 'Milik User' }, ownerTypeSel);
    mk('option', { value: 'group', textContent: 'Milik Group' }, ownerTypeSel);
    ownerIdInp = mk('input', { type: 'text', inputMode: 'numeric', placeholder: 'User ID / Group ID' }, row1);

    const adv = mk('details', { className: 'group' }, acc);
    mk('summary', { textContent: 'Opsi lanjutan unggahan' }, adv);
    const row2 = mk('div', { className: 'row' }, adv);
    namePrefixInp = mk('input', { type: 'text', placeholder: 'Nama awalan (default: Skybox)' }, row2);
    if (pendingSuggest) { namePrefixInp.value = pendingSuggest; prefixAuto = pendingSuggest; pendingSuggest = ''; }
    typeSel = mk('select', {}, row2); typeSel.style.cssText = 'min-height:44px;border-radius:8px';
    mk('option', { value: 'auto', textContent: 'Tipe: Otomatis (coba Image, fallback Decal)' }, typeSel);
    mk('option', { value: 'Image', textContent: 'Tipe: Image' }, typeSel);
    mk('option', { value: 'Decal', textContent: 'Tipe: Decal' }, typeSel);
    const btnDel = mk('button', { type: 'button', textContent: 'Hapus akun tersimpan terpilih' }, adv);
    btnDel.style.marginTop = '6px';

    // ── Langkah 2 · Unggah 6 Sisi ──
    const s2 = mk('details', { className: 'group', open: true }, root);
    mk('summary', { textContent: '2 · Unggah 6 Sisi' }, s2);
    const grid = mk('div', {}, s2);
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin:10px 0';
    // Label kartu = nama properti Roblox yang diisi gambarnya.
    PROP_KEYS.forEach(k => {
      const cell = mk('div', {}, grid);
      cell.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px;background:var(--panel2)';
      mk('strong', { textContent: 'Skybox' + k }, cell);
      const status = mk('div', { textContent: 'Belum diunggah', className: 'rbx-status' }, cell);
      const retry = mk('button', { type: 'button', textContent: 'Coba lagi', hidden: true }, cell);
      retry.style.cssText = 'margin-top:4px;min-height:32px;font-size:12px';
      retry.addEventListener('click', () => run(state, onIdsUpdated, k));
      rows[k] = { status, retry };
    });

    btnUpload = mk('button', { type: 'button', className: 'primary', textContent: 'Upload ke Roblox' }, s2);
    btnUpload.style.marginTop = '4px';
    btnUpload.addEventListener('click', () => run(state, onIdsUpdated));
    const btnReset = mk('button', { type: 'button', textContent: 'Mulai dari awal' }, s2);
    btnReset.style.cssText = 'margin:4px 0 0 8px';
    btnReset.addEventListener('click', () => { resetProgress(); log('Progres direset; upload berikutnya mengunggah ke-6 sisi dari awal.'); });
    mk('p', { className: 'note', textContent: 'Tips: pakai akun alt untuk gambar yang belum yakin lolos moderasi Roblox.', style: 'margin-top:6px' }, s2);
    logEl = mk('div', { className: 'rbx-log' }, s2);

    // ── Vault ──
    function refreshVault(selectId) {
      const list = loadProfiles();
      vaultSel.textContent = '';
      mk('option', { value: '', textContent: list.length ? 'Pilih akun tersimpan…' : 'Belum ada akun tersimpan' }, vaultSel);
      list.forEach(p => mk('option', { value: p.id, textContent: p.label + (p.enc || p.dev ? ' 🔒' : '') }, vaultSel));
      if (selectId) vaultSel.value = selectId;
    }
    function fill(p) {
      ownerTypeSel.value = p.ownerType; ownerIdInp.value = p.ownerId;
      if (p.prefix) { namePrefixInp.value = p.prefix; prefixAuto = ''; }
      typeSel.value = p.type || 'auto';
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
        } else if (p.dev) {
          apiKeyInp.value = await window.Vault.deviceDecrypt(p.dev);
        } else if (p.key) apiKeyInp.value = p.key; else { log('Akun "' + p.label + '" belum punya API key di perangkat ini: tempel API key di bawah, lalu tekan Simpan akun.'); return; }
        window.Vault.lastSet(p.id);
        log('Akun "' + p.label + '" dipakai.');
      } catch (e) { log('Kata sandi salah atau data rusak.'); }
    }
    btnUse.addEventListener('click', () => useProfile(vaultSel.value));
    btnDel.addEventListener('click', () => {
      const id = vaultSel.value; if (!id) { log('Pilih akun yang mau dihapus.'); return; }
      saveProfiles(loadProfiles().filter(p => p.id !== id));
      if (window.Vault.lastGet() === id) window.Vault.lastClear();
      refreshVault(); log('Akun dihapus dari browser ini.');
    });
    btnSave.addEventListener('click', async () => {
      const label = vaultNameInp.value.trim().slice(0, 40);
      const key = apiKeyInp.value.trim(), ownerId = ownerIdInp.value.trim();
      if (!label) { log('Beri nama akun dulu.'); return; }
      if (!key) { log('API Key kosong; isi dulu sebelum menyimpan.'); return; }
      if (!/^\d+$/.test(ownerId)) { log('User ID / Group ID harus berupa angka.'); return; }
      const r = await persist(label, key, ownerId, true);
      if (r) log('Akun "' + label + '" disimpan' + (r.mode === 'plain' ? ' (tanpa enkripsi).' : ' (terenkripsi).'));
    });

    async function persist(label, key, ownerId, askPlain) {
      const pass = vaultPassInp.value;
      const p = { id: '', label, ownerType: ownerTypeSel.value, ownerId, prefix: namePrefixInp.value.trim() === prefixAuto ? '' : namePrefixInp.value.trim(), type: typeSel.value };
      let mode = 'dev';
      try {
        if (pass) { p.enc = await encrypt(key, pass); mode = 'pass'; }
        else p.dev = await window.Vault.deviceEncrypt(key);
      } catch (e) {
        if (askPlain && !confirm('Enkripsi tidak tersedia di browser ini (butuh HTTPS). Simpan API key sebagai teks biasa?')) return null;
        if (!askPlain) { log('API key tidak bisa disimpan di browser ini: ' + e.message); return null; }
        p.key = key; mode = 'plain';
      }
      const list = loadProfiles(), old = list.find(x => x.label === label);
      p.id = old ? old.id : String(Date.now());
      if (!saveProfiles(old ? list.map(x => x.id === old.id ? p : x) : list.concat(p))) { log('Gagal menyimpan (penyimpanan browser tidak tersedia).'); return null; }
      window.Vault.lastSet(p.id);
      refreshVault(p.id);
      return { id: p.id, mode };
    }

    // Dipanggil setelah Roblox menerima API key (sisi pertama berhasil): simpan otomatis kalau "Ingat" aktif.
    autoSave = async function () {
      if (!rememberChk.checked) return;
      const key = apiKeyInp.value.trim(), ownerId = ownerIdInp.value.trim();
      if (!key || !/^\d+$/.test(ownerId)) return;
      const cur = loadProfiles().find(x => x.id === vaultSel.value) || loadProfiles().find(x => x.ownerType === ownerTypeSel.value && x.ownerId === ownerId);
      const label = (cur && cur.label) || vaultNameInp.value.trim().slice(0, 40) || ('Akun ' + ownerId);
      const r = await persist(label, key, ownerId, false);
      if (r) { vaultNameInp.value = label; log('API key diingat di browser ini; upload berikutnya tidak perlu memasukkannya lagi.'); }
    };

    // ── OAuth status check + gate sesi situs ──
    function renderOauth() {
      const logged = !!(oauthAcc && oauthAcc.loggedIn);
      oauthBtnLogin.hidden = logged;
      oauthBtnLogout.hidden = !logged;
      oauthLine.textContent = logged
        ? 'Login sebagai ' + (oauthAcc.name || 'Roblox') + ' — upload otomatis aktif.'
        : 'Status: belum terhubung.';
    }
    async function checkOauth() {
      try {
        const r = await fetch('/api/rbx-oauth/status');
        const j = await r.json();
        if (!j.configured) { oauthBox.hidden = true; return; }
        oauthBox.hidden = false;
        const m = await fetch('/api/rbx-oauth/me').then(x => x.ok ? x.json() : { loggedIn: false }).catch(() => ({ loggedIn: false }));
        oauthAcc = m;
        renderOauth();
        if (m && m.loggedIn) log('Login Roblox (' + (m.name || '') + ') aktif — jalur cepat dipakai, API key tidak perlu.');
      } catch (e) { oauthBox.hidden = true; }
    }
    checkOauth();

    window.Auth.ready.then(async user => {
      await checkOauth();
      if (!user) { gate.hidden = false; acc.hidden = true; return; }
      window.Vault.setUser(user.id); gate.hidden = true; acc.hidden = false;
      await window.Vault.pull();
      const last = window.Vault.lastGet();
      refreshVault(last);
      const lp = loadProfiles().find(x => x.id === last);
      if (lp) { if (lp.enc) { fill(lp); log('Akun "' + lp.label + '" tersimpan. Isi kata sandi lalu tekan Pakai.'); } else useProfile(lp.id); }
    });
  }

  return { build, suggestPrefix };
})();

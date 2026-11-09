"use strict";
(function () {
  const V = window.Vault, $ = id => document.getElementById(id);
  try { const t = JSON.parse(localStorage.getItem('skybox.prefs.v1')).theme; if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) {}

  const el = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };
  const msg = t => { $('fMsg').textContent = t; };

  function render() {
    const accs = V.loadProfiles(), hist = V.history();
    $('stAcc').textContent = accs.length;
    $('stUp').textContent = hist.length;
    $('stLast').textContent = hist[0] ? new Date(hist[0].t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

    const al = $('accList'); al.textContent = '';
    if (!accs.length) el('p', { className: 'empty', textContent: 'Belum ada akun tersimpan. Tambahkan di form bawah.' }, al);
    accs.forEach(p => {
      const row = el('div', { className: 'item' }, al);
      const info = el('div', {}, row);
      el('strong', { textContent: p.label + (p.enc || p.dev ? ' 🔒' : p.key ? ' ⚠️ tanpa enkripsi' : ' 🔑 key belum ada di perangkat ini') }, info);
      el('small', { textContent: (p.ownerType === 'group' ? 'Group ' : 'User ') + p.ownerId + ' · awalan ' + (p.prefix || 'Skybox') }, info);
      const act = el('div', { className: 'row' }, row); act.style.marginTop = '0';
      el('button', { type: 'button', textContent: 'Pakai di Upload', onclick: () => { V.lastSet(p.id); location.href = 'studio.html#rbx'; } }, act);
      el('button', { type: 'button', textContent: 'Hapus', onclick: () => { if (confirm('Hapus akun "' + p.label + '" dari browser ini?')) { V.saveProfiles(V.loadProfiles().filter(x => x.id !== p.id)); render(); } } }, act);
    });

    const hl = $('histList'); hl.textContent = '';
    if (!hist.length) el('p', { className: 'empty', textContent: 'Belum ada upload. Setelah upload ke Roblox selesai, ID tiap sisi tercatat di sini.' }, hl);
    hist.forEach(h => {
      const row = el('div', { className: 'item' }, hl);
      const info = el('div', {}, row);
      el('strong', { textContent: h.base + ' (' + h.type + ')' }, info);
      el('small', { textContent: new Date(h.t).toLocaleString('id-ID') + ' · ' + Object.keys(h.ids).map(k => k + ': ' + h.ids[k]).join(' · ') }, info);
    });
  }

  $('fSave').addEventListener('click', async () => {
    const label = $('fName').value.trim().slice(0, 40), key = $('fKey').value.trim(), ownerId = $('fId').value.trim(), pass = $('fPass').value;
    if (!label) return msg('Beri nama akun dulu.');
    if (!/^\d+$/.test(ownerId)) return msg('User ID / Group ID harus berupa angka.');
    if (!key) return msg('API Key wajib diisi.');
    const p = { id: '', label, ownerType: $('fType').value, ownerId, prefix: $('fPrefix').value.trim(), type: 'auto' };
    try { if (pass) p.enc = await V.encrypt(key, pass); else p.dev = await V.deviceEncrypt(key); }
    catch (e) {
      if (!confirm('Enkripsi tidak tersedia di browser ini (butuh HTTPS). Simpan API key sebagai teks biasa?')) return;
      p.key = key;
    }
    const list = V.loadProfiles(), old = list.find(x => x.label === label);
    p.id = old ? old.id : String(Date.now());
    if (!V.saveProfiles(old ? list.map(x => x.id === old.id ? p : x) : list.concat(p))) return msg('Gagal menyimpan (penyimpanan browser tidak tersedia).');
    ['fName', 'fId', 'fPrefix', 'fKey', 'fPass'].forEach(i => { $(i).value = ''; });
    msg('Akun "' + label + '" disimpan.'); render();
  });

  window.Auth.ready.then(async u => {
    if (u) { V.setUser(u.id); await V.pull(); } else { $('loginCard').hidden = false; window.Auth.buttons($('loginBtns'), false); }
    render();
  });
})();

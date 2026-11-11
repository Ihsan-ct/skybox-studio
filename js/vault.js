"use strict";
// Brankas akun + riwayat upload. Semua di localStorage browser ini; tidak pernah dikirim ke server.
window.Vault = (function () {
  const STORE = 'rsk.profiles', LAST = 'rsk.last', HIST = 'rsk.history';
  const b64 = u => btoa(String.fromCharCode(...u));
  const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  let ns = '', uid = null, timer = null;
  const k = b => ns ? b + '.' + ns : b;
  const strip = p => ({ id: p.id, label: p.label, ownerType: p.ownerType, ownerId: p.ownerId, prefix: p.prefix || '', type: p.type || 'auto' });
  const loadProfiles = () => read(k(STORE), []);
  const history = () => read(k(HIST), []);
  const saveProfiles = l => { const ok = write(k(STORE), l); push(); return ok; };
  const addHistory = e => { const ok = write(k(HIST), [e].concat(history()).slice(0, 20)); push(); return ok; };
  const lastGet = () => { try { return localStorage.getItem(k(LAST)); } catch (e) { return null; } };
  const lastSet = id => { try { localStorage.setItem(k(LAST), id); } catch (e) {} };
  const lastClear = () => { try { localStorage.removeItem(k(LAST)); } catch (e) {} };
  // Data lokal dipisah per pengguna yang login; data lama (tanpa login) disalin sekali ke pengguna pertama.
  function setUser(id) {
    uid = id; ns = id ? id.replace(/[^\w:-]/g, '_') : '';
    if (id && read(k(STORE), null) === null) {
      const lp = read(STORE, null), lh = read(HIST, null);
      if (lp) write(k(STORE), lp); if (lh) write(k(HIST), lh);
    }
  }
  // Hanya metadata (tanpa API key) yang dikirim ke server.
  // Server mengembalikan 501 bila database belum dikonfigurasi: berhenti memanggil /api/sync selama sesi ini.
  let syncOff = false;
  function push() {
    if (!uid || syncOff) return;
    clearTimeout(timer);
    timer = setTimeout(() => fetch('/api/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profiles: loadProfiles().map(strip), history: history() }) }).then(r => { if (r.status === 501) syncOff = true; }).catch(() => {}), 600);
  }
  async function pull() {
    if (!uid || syncOff) return false;
    try {
      const r = await fetch('/api/sync'); if (r.status === 501) syncOff = true; if (!r.ok) return false;
      const d = await r.json();
      if (!d.profiles && !d.history) { push(); return true; }
      const local = loadProfiles();
      write(k(STORE), (d.profiles || []).map(sp => { const lp = local.find(x => x.id === sp.id); return lp ? Object.assign({}, sp, { enc: lp.enc, key: lp.key, dev: lp.dev }) : sp; }));
      write(k(HIST), d.history || []);
      return true;
    } catch (e) { return false; }
  }

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

  // Kunci perangkat: CryptoKey AES-GCM yang tidak bisa diekspor, disimpan di IndexedDB browser ini.
  // Dipakai supaya API key tersimpan terenkripsi tanpa kata sandi dan terisi otomatis.
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('rsk-device', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function deviceKey(create) {
    const db = await idb();
    const get = () => new Promise((res, rej) => { const q = db.transaction('k').objectStore('k').get('main'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    let key = await get();
    if (!key && create) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await new Promise((res, rej) => { const t = db.transaction('k', 'readwrite'); t.objectStore('k').put(key, 'main'); t.oncomplete = res; t.onerror = () => rej(t.error); });
    }
    db.close();
    return key;
  }
  async function deviceEncrypt(text) {
    const key = await deviceKey(true), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    return { iv: b64(iv), data: b64(new Uint8Array(ct)) };
  }
  async function deviceDecrypt(d) {
    const key = await deviceKey(false);
    if (!key) throw new Error('kunci perangkat tidak ada');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv) }, key, unb64(d.data));
    return new TextDecoder().decode(pt);
  }
  return { deviceEncrypt, deviceDecrypt, loadProfiles, saveProfiles, history, addHistory, encrypt, decrypt, setUser, pull, lastGet, lastSet, lastClear };
})();

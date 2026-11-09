"use strict";
(function () {
  const $ = id => document.getElementById(id);
  const GL = window.GLConvert;
  const V3D = window.Viewer3D;

  const PREFS_KEY = 'skybox.prefs.v1';
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

      const clean = {};
      clean.exportRes = [512, 1024, 2048].includes(parsed.exportRes) ? parsed.exportRes : 1024;
      clean.rotUp = [0, 90, 180, 270].includes(parsed.rotUp) ? parsed.rotUp : 0;
      clean.rotDn = [0, 90, 180, 270].includes(parsed.rotDn) ? parsed.rotDn : 0;
      clean.theme = ['auto', 'dark', 'light'].includes(parsed.theme) ? parsed.theme : 'auto';
      clean.fadeHorizon = (typeof parsed.fadeHorizon === 'number' && Number.isFinite(parsed.fadeHorizon) && parsed.fadeHorizon >= 0 && parsed.fadeHorizon <= 45) ? parsed.fadeHorizon : 0;
      clean.fadeColor = (typeof parsed.fadeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.fadeColor)) ? parsed.fadeColor : '#808080';
      return clean;
    } catch (_) {
      return {};
    }
  }

  function savePrefs() {
    try {
      const data = {
        exportRes: state.exportRes,
        rotUp: state.rotUp,
        rotDn: state.rotDn,
        theme: state.theme,
        fadeHorizon: state.fadeHorizon,
        fadeColor: state.fadeColor
      };
      localStorage.setItem(PREFS_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  const saved = loadPrefs();
  const DEFAULTS = {
    yaw: 0, pitch: 0, horizon: 0, fadeHorizon: saved.fadeHorizon || 0, fadeColor: saved.fadeColor || '#808080',
    brightness: 0, contrast: 0, saturation: 100, warmth: 0, seamBlend: 8, fadeTop: 0, fadeTopColor: '#0a1030',
    rotUp: (typeof saved.rotUp === 'number') ? saved.rotUp : 0,
    rotDn: (typeof saved.rotDn === 'number') ? saved.rotDn : 0,
    flipH: false,
    watermarkImg: null, watermarkScale: 25, watermarkOpacity: 50,
    theme: saved.theme || 'auto'
  };

  const state = Object.assign({
    image: null, exportRes: saved.exportRes || 1024,
    ids: { Ft: '', Bk: '', Lf: '', Rt: '', Up: '', Dn: '' }
  }, DEFAULTS);

  let busy = false;
  let activeTab = 'cross';
  const PREVIEW = 256;

  const crossCanvases = {};
  const canvases3D = {};
  GL.FACES.forEach(f => {
    const c1 = document.createElement('canvas'); c1.width = PREVIEW; c1.height = PREVIEW;
    crossCanvases[f.k] = c1;
    const c2 = document.createElement('canvas'); c2.width = 512; c2.height = 512;
    canvases3D[f.k] = c2;
  });

  function setStatus(data) {
    const s = $('status');
    s.textContent = '';
    if (!data) return;
    if (typeof data === 'string') {
      s.textContent = data;
    } else if (typeof data === 'object') {
      if (data.text) {
        s.appendChild(document.createTextNode(data.text + ' '));
      }
      if (data.linkUrl) {
        const a = document.createElement('a');
        a.href = data.linkUrl;
        a.textContent = data.linkLabel || 'klik di sini untuk mengunduh manual';
        if (data.download) a.setAttribute('download', data.download);
        s.appendChild(a);
      }
    }
  }

  function addBanner(kind, text, actions = []) {
    const el = document.createElement('div');
    el.className = 'banner ' + kind;
    const msg = document.createElement('div');
    msg.className = 'msg';
    const t = document.createElement('div');
    t.textContent = text;
    msg.appendChild(t);

    if (actions && actions.length > 0) {
      const acts = document.createElement('div');
      acts.className = 'acts';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = a.label;
        btn.addEventListener('click', () => { a.fn(); el.remove(); });
        acts.appendChild(btn);
      });
      msg.appendChild(acts);
    }
    el.appendChild(msg);

    const x = document.createElement('button');
    x.type = 'button'; x.className = 'x'; x.textContent = '×';
    x.setAttribute('aria-label', 'Tutup peringatan');
    x.addEventListener('click', () => el.remove());
    el.appendChild(x);

    $('banners').appendChild(el);
    return el;
  }
  function clearBanners() { $('banners').textContent = ''; }

  function applyTheme(theme) {
    state.theme = ['auto', 'dark', 'light'].includes(theme) ? theme : 'auto';
    if (state.theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', state.theme);
    }
    ['auto', 'dark', 'light'].forEach(t => {
      const b = $('th-' + t);
      if (b) b.setAttribute('aria-pressed', String(t === state.theme));
    });
    savePrefs();
  }
  $('th-auto').addEventListener('click', () => applyTheme('auto'));
  $('th-dark').addEventListener('click', () => applyTheme('dark'));
  $('th-light').addEventListener('click', () => applyTheme('light'));
  applyTheme(state.theme);

  const cross = $('cross');
  cross.width = PREVIEW * 4; cross.height = PREVIEW * 3;
  const cctx = cross.getContext('2d');
  let rafPending = false;
  let debounce3dTimer = null;

  function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderCross();
      if (activeTab === '3d') schedule3DRender();
    });
  }

  function renderCross() {
    if (!state.image || busy) return;
    GL.setSize(PREVIEW);
    cctx.fillStyle = '#0d0f14'; cctx.fillRect(0, 0, cross.width, cross.height);

    GL.FACES.forEach(f => {
      GL.drawFace(f, PREVIEW, state);
      const c = crossCanvases[f.k];
      const ctx = c.getContext('2d');
      ctx.drawImage(GL.glCanvas, 0, 0);
      GL.applyWatermark(ctx, f.k, PREVIEW, state);
      cctx.drawImage(c, f.cell[0] * PREVIEW, f.cell[1] * PREVIEW);
    });
  }

  function schedule3DRender() {
    clearTimeout(debounce3dTimer);
    debounce3dTimer = setTimeout(() => {
      render3DTextures();
    }, 120);
  }

  function render3DTextures() {
    if (!state.image || busy || activeTab !== '3d') return;
    const res3d = 1024;
    GL.setSize(res3d);

    GL.FACES.forEach(f => {
      GL.drawFace(f, res3d, state);
      const c = canvases3D[f.k];
      if (c.width !== res3d || c.height !== res3d) { c.width = res3d; c.height = res3d; }
      const ctx = c.getContext('2d');
      ctx.drawImage(GL.glCanvas, 0, 0);
      GL.applyWatermark(ctx, f.k, res3d, state);
      V3D.updateFaceTexture(f.k, c);
    });
  }

  function setImage(src, w, h, name, size, opts = {}) {
    if (!opts.keepBanners) clearBanners();

    const max = GL.getMaxTex();
    let effectiveSrc = src;
    let ew = w, eh = h;
    if (w > max || h > max) {
      const scale = max / Math.max(w, h);
      ew = Math.round(w * scale); eh = Math.round(h * scale);
      const tempC = document.createElement('canvas'); tempC.width = ew; tempC.height = eh;
      const tctx = tempC.getContext('2d'); tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(src, 0, 0, ew, eh);
      effectiveSrc = tempC;
      addBanner('info', `Gambar diperkecil dari ${w}×${h} px ke ${ew}×${eh} px agar muat pada limit GPU.`);
    }

    const prevImage = state.image;
    try {
      GL.uploadTexture(effectiveSrc);
    } catch (e) {
      if (prevImage && prevImage.source) {
        try { GL.uploadTexture(prevImage.source); } catch (_) {}
      } else {
        state.image = null;
      }
      addBanner('error', 'Gagal memproses tekstur GPU: ' + e.message);
      return;
    }

    state.image = { source: effectiveSrc, width: ew, height: eh, origWidth: w, origHeight: h, name, size };

    let info = `${name} · ${w}×${h} px`;
    if (ew !== w || eh !== h) info += ` (GPU: ${ew}×${eh} px)`;
    $('fileinfo').textContent = info;
    $('empty').hidden = true;
    $('btnZip').disabled = false;
    document.querySelectorAll('#facebtns button').forEach(b => b.disabled = false);

    if (!opts.skipRatioCheck) {
      const ratio = w / h;
      if (Math.abs(ratio - 2.0) / 2.0 > 0.05) {
        addBanner('warn', `Rasio gambar (${w}×${h}) bukan 2:1. Skybox mungkin terlihat terdistorsi.`, [
          { label: 'Biarkan (diregangkan)', fn: () => {} },
          {
            label: 'Crop ke 2:1',
            fn: () => {
              const targetW = ratio > 2.0 ? Math.round(h * 2) : w;
              const targetH = ratio > 2.0 ? h : Math.round(w / 2);
              const sx = Math.max(0, (w - targetW) / 2);
              const sy = Math.max(0, (h - targetH) / 2);
              const c = document.createElement('canvas'); c.width = targetW; c.height = targetH;
              c.getContext('2d').drawImage(src, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
              setImage(c, targetW, targetH, name + ' [crop 2:1]', null, { skipRatioCheck: true });
            }
          },
          {
            label: 'Pad ke 2:1',
            fn: () => {
              const targetW = ratio > 2.0 ? w : Math.round(h * 2);
              const targetH = ratio > 2.0 ? Math.round(w / 2) : h;
              const dx = (targetW - w) / 2;
              const dy = (targetH - h) / 2;
              const c = document.createElement('canvas'); c.width = targetW; c.height = targetH;
              const ctx = c.getContext('2d');
              ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, targetW, targetH);
              ctx.drawImage(src, dx, dy, w, h);
              setImage(c, targetW, targetH, name + ' [pad 2:1]', null, { skipRatioCheck: true });
            }
          }
        ]);
      }
    }

    requestRender();
    if (activeTab === '3d') render3DTextures();
  }

  function loadFile(file) {
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      addBanner('error', 'Berkas "' + file.name + '" bukan file gambar.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      handleNewImage(img, img.naturalWidth, img.naturalHeight, file.name, file.size);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      addBanner('error', 'Gagal memuat gambar "' + file.name + '". Berkas rusak atau tidak didukung.');
    };
    img.src = url;
  }


  // ---------- Gambar 2D biasa -> panorama 360° otomatis ----------
  const flat = { src: null, w: 0, h: 0, name: '', size: null, mode: '2d', kind: 'scene', fov: 100, offset: 0, edge: 18 };
  let flatTimer = null, flatToken = 0;

  function flatPitch() {
    if (flat.kind !== 'sky') return flat.offset;
    const vfov = 2 * Math.atan(Math.tan(flat.fov * Math.PI / 360) * flat.h / flat.w) * 180 / Math.PI;
    return vfov / 2 + flat.offset;
  }

  function showFlatPanel(on) {
    $('grpFlat').hidden = !on;
    $('flatCtl').hidden = !on || flat.mode !== '2d';
  }

  function applyFlat() {
    if (!flat.src) return;
    if (flat.mode === 'pano') {
      setImage(flat.src, flat.w, flat.h, flat.name, flat.size, { skipRatioCheck: true });
      return;
    }
    const token = ++flatToken;
    const note = $('flatNote');
    note.textContent = 'Memproses panorama…';
    setTimeout(() => {
      if (token !== flatToken) return;
      try {
        const c = window.Flat2Pano.convert(flat.src, flat.w, flat.h, {
          fov: flat.fov, pitch: flatPitch(), edge: flat.edge, maxW: Math.min(4096, GL.getMaxTex())
        });
        if (token !== flatToken) return;
        setImage(c, c.width, c.height, flat.name + ' [2D→360°]', flat.size, { skipRatioCheck: true });
        note.textContent = 'Gambar ditempatkan di depan kamera tanpa melar, sisanya diisi otomatis dari warna gambar dan menyambung 360°.';
      } catch (e) {
        note.textContent = '';
        addBanner('error', 'Gagal mengubah gambar 2D menjadi panorama: ' + e.message);
      }
    }, 30);
  }

  function scheduleFlat() {
    clearTimeout(flatTimer);
    flatTimer = setTimeout(applyFlat, 250);
  }

  function handleNewImage(src, w, h, name, size) {
    clearBanners();
    flat.src = src; flat.w = w; flat.h = h; flat.name = name; flat.size = size;
    if (window.RobloxUpload && window.RobloxUpload.suggestPrefix) window.RobloxUpload.suggestPrefix(name);
    const ratio = w / h;
    flat.mode = Math.abs(ratio - 2.0) / 2.0 <= 0.05 ? 'pano' : '2d';
    syncFlatUI();
    showFlatPanel(true);
    applyFlat();
  }

  function clearFlat() {
    flat.src = null; flatToken++;
    showFlatPanel(false);
  }

  function makeFlatSeg(root, items, getCur, onPick) {
    root.textContent = '';
    items.forEach(it => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = it.label;
      b.addEventListener('click', () => { onPick(it.v); refresh(); });
      root.appendChild(b);
    });
    function refresh() {
      Array.from(root.children).forEach((b, i) => b.setAttribute('aria-pressed', String(items[i].v === getCur())));
    }
    refresh();
    return refresh;
  }

  const refreshMode = makeFlatSeg($('segMode'),
    [{ label: 'Gambar 2D biasa', v: '2d' }, { label: 'Panorama 360°', v: 'pano' }],
    () => flat.mode, v => { flat.mode = v; $('flatCtl').hidden = v !== '2d'; applyFlat(); });
  const refreshKind = makeFlatSeg($('segKind'),
    [{ label: 'Pemandangan', v: 'scene' }, { label: 'Langit (di atas horizon)', v: 'sky' }],
    () => flat.kind, v => { flat.kind = v; scheduleFlat(); });

  const flatSliders = {};
  function addFlatSlider(key, label, min, max, step, unit) {
    const wrap = document.createElement('div'); wrap.className = 'slider';
    const lab = document.createElement('label'); lab.htmlFor = 'fs_' + key; lab.textContent = label;
    const out = document.createElement('output'); out.htmlFor = 'fs_' + key;
    const inp = document.createElement('input'); inp.type = 'range'; inp.id = 'fs_' + key;
    inp.min = min; inp.max = max; inp.step = step; inp.value = flat[key];
    const show = () => { out.textContent = flat[key] + unit; };
    inp.addEventListener('input', () => { flat[key] = Number(inp.value); show(); scheduleFlat(); });
    wrap.appendChild(lab); wrap.appendChild(out); wrap.appendChild(inp);
    $('grpFlatSliders').appendChild(wrap);
    flatSliders[key] = { inp, show };
    show();
  }
  addFlatSlider('fov', 'Lebar sudut pandang gambar', 40, 150, 1, '°');
  addFlatSlider('offset', 'Geser naik / turun', -40, 40, 1, '°');
  addFlatSlider('edge', 'Pelembutan tepi gambar', 0, 30, 1, '%');

  function syncFlatUI() {
    refreshMode(); refreshKind();
    $('flatCtl').hidden = flat.mode !== '2d';
  }

  window.addEventListener('paste', e => {
    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const f = item.getAsFile();
          if (f) loadFile(f);
          break;
        }
      }
    }
  });

  const sliders = {};
  function addSlider(parent, key, label, min, max, step, unit, onChangeExtra) {
    const wrap = document.createElement('div'); wrap.className = 'slider';
    const lab = document.createElement('label'); lab.htmlFor = 's_' + key; lab.textContent = label;
    const out = document.createElement('output'); out.htmlFor = 's_' + key;
    const inp = document.createElement('input'); inp.type = 'range'; inp.id = 's_' + key;
    inp.min = min; inp.max = max; inp.step = step; inp.value = state[key];
    const show = () => { out.textContent = state[key] + unit; };
    inp.addEventListener('input', () => {
      state[key] = Number(inp.value);
      show();
      if (onChangeExtra) onChangeExtra();
      requestRender();
    });
    wrap.appendChild(lab); wrap.appendChild(out); wrap.appendChild(inp);
    parent.appendChild(wrap);
    sliders[key] = { inp, show };
    show();
  }
  function setSlider(k, v) { state[k] = v; if (sliders[k]) { sliders[k].inp.value = v; sliders[k].show(); } }

  addSlider($('grpPos'), 'yaw', 'Yaw (horizontal)', 0, 360, 1, '°');
  addSlider($('grpPos'), 'pitch', 'Pitch (vertikal)', -45, 45, 1, '°');
  addSlider($('grpPos'), 'horizon', 'Horizon Level', -30, 30, 1, '°');
  addSlider($('grpPos'), 'seamBlend', 'Haluskan sambungan', 0, 25, 1, '%');
  addSlider($('grpPos'), 'fadeHorizon', 'Fade Horizon', 0, 45, 1, '°', savePrefs);

  const fadeColorWrap = document.createElement('div'); fadeColorWrap.className = 'color-picker';
  const fadeColorLab = document.createElement('label'); fadeColorLab.textContent = 'Warna Fade'; fadeColorLab.htmlFor = 'fadeColor';
  const fadeColorInp = document.createElement('input'); fadeColorInp.type = 'color'; fadeColorInp.id = 'fadeColor'; fadeColorInp.value = state.fadeColor;
  fadeColorInp.addEventListener('input', () => {
    state.fadeColor = fadeColorInp.value;
    savePrefs();
    requestRender();
  });
  fadeColorWrap.appendChild(fadeColorLab); fadeColorWrap.appendChild(fadeColorInp);
  $('grpPos').appendChild(fadeColorWrap);

  addSlider($('grpPos'), 'fadeTop', 'Fade Atas (kutub)', 0, 60, 1, '°');
  const fadeTopWrap = document.createElement('div'); fadeTopWrap.className = 'color-picker';
  const fadeTopLab = document.createElement('label'); fadeTopLab.textContent = 'Warna Fade Atas'; fadeTopLab.htmlFor = 'fadeTopColor';
  const fadeTopInp = document.createElement('input'); fadeTopInp.type = 'color'; fadeTopInp.id = 'fadeTopColor'; fadeTopInp.value = state.fadeTopColor;
  fadeTopInp.addEventListener('input', () => { state.fadeTopColor = fadeTopInp.value; requestRender(); });
  fadeTopWrap.appendChild(fadeTopLab); fadeTopWrap.appendChild(fadeTopInp);
  $('grpPos').appendChild(fadeTopWrap);

  // --- Preset tampilan (tidak mengubah yaw/pitch/horizon, rotasi, atau resolusi) ---
  const PRESETS = [
    { name: 'Asli',        v: { brightness: 0,  contrast: 0,  saturation: 100, warmth: 0,   fadeHorizon: 0, fadeTop: 0,  seamBlend: 8 } },
    { name: 'Malam',       v: { brightness: -5, contrast: 12, saturation: 110, warmth: -25, fadeHorizon: 0, fadeTop: 25, seamBlend: 8 }, topColor: '#0a1030' },
    { name: 'Sunset',      v: { brightness: 0,  contrast: 10, saturation: 125, warmth: 35,  fadeHorizon: 0, fadeTop: 20, seamBlend: 8 }, topColor: '#2b1233' },
    { name: 'Siang Cerah', v: { brightness: 4,  contrast: 8,  saturation: 115, warmth: 8,   fadeHorizon: 0, fadeTop: 15, seamBlend: 8 }, topColor: '#4a8fd9' },
    { name: 'Dingin',      v: { brightness: 0,  contrast: 8,  saturation: 95,  warmth: -40, fadeHorizon: 0, fadeTop: 0,  seamBlend: 8 } },
    { name: 'Hangat',      v: { brightness: 2,  contrast: 5,  saturation: 108, warmth: 40,  fadeHorizon: 0, fadeTop: 0,  seamBlend: 8 } },
    { name: 'Dramatis',    v: { brightness: -8, contrast: 25, saturation: 120, warmth: 0,   fadeHorizon: 0, fadeTop: 0,  seamBlend: 8 } }
  ];
  (function buildPresets() {
    const det = document.createElement('details'); det.className = 'group'; det.open = true;
    const sum = document.createElement('summary'); sum.textContent = 'Preset tampilan';
    const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '4px';
    PRESETS.forEach(pr => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = pr.name;
      b.addEventListener('click', () => {
        Object.keys(pr.v).forEach(k => setSlider(k, pr.v[k]));
        if (pr.topColor) { state.fadeTopColor = pr.topColor; fadeTopInp.value = pr.topColor; }
        savePrefs();
        requestRender();
      });
      row.appendChild(b);
    });
    const note = document.createElement('p'); note.className = 'note';
    note.textContent = 'Titik awal yang cepat. Setelah memilih, sesuaikan lagi slider sesuai selera.';
    det.appendChild(sum); det.appendChild(row); det.appendChild(note);
    const host = $('sec-controls'); host.insertBefore(det, host.firstElementChild);
  })();

  addSlider($('grpColor'), 'brightness', 'Brightness', -100, 100, 1, '');
  addSlider($('grpColor'), 'contrast', 'Contrast', -100, 100, 1, '');
  addSlider($('grpColor'), 'saturation', 'Saturation', 0, 200, 1, '%');
  addSlider($('grpColor'), 'warmth', 'Warmth (Suhu)', -100, 100, 1, '');

  $('btnWmPick').addEventListener('click', () => $('wmFile').click());
  $('wmFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        state.watermarkImg = img;
        $('wmName').textContent = f.name;
        requestRender();
      };
      img.src = url;
    }
  });
  $('btnWmClear').addEventListener('click', () => {
    state.watermarkImg = null; $('wmFile').value = ''; $('wmName').textContent = 'Belum ada logo'; requestRender();
  });
  addSlider($('grpWm'), 'watermarkScale', 'Ukuran Logo', 5, 50, 1, '%');
  addSlider($('grpWm'), 'watermarkOpacity', 'Transparansi', 10, 100, 1, '%');

  function makeSeg(el, values, labelFn, getFn, setFn) {
    const refresh = () => el.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.v) === getFn())));
    values.forEach(v => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = labelFn(v);
      b.addEventListener('click', () => { setFn(v); refresh(); savePrefs(); });
      el.appendChild(b);
    });
    refresh();
    return refresh;
  }

  makeSeg($('segRes'), [512, 1024, 2048], v => v + ' px', () => state.exportRes, v => {
    state.exportRes = v;
    if (activeTab === '3d') schedule3DRender();
  });
  const refUp = makeSeg($('segUp'), [0, 90, 180, 270], v => v + '°', () => state.rotUp, v => { state.rotUp = v; requestRender(); });
  const refDn = makeSeg($('segDn'), [0, 90, 180, 270], v => v + '°', () => state.rotDn, v => { state.rotDn = v; requestRender(); });
  $('flipH').addEventListener('change', e => { state.flipH = e.target.checked; requestRender(); });

  document.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.reset;
    if (g === 'pos') {
      setSlider('yaw', 0); setSlider('pitch', 0); setSlider('horizon', 0); setSlider('fadeHorizon', 0); setSlider('seamBlend', 8);
      state.fadeColor = '#808080'; fadeColorInp.value = '#808080';
      setSlider('fadeTop', 0); state.fadeTopColor = '#0a1030'; fadeTopInp.value = '#0a1030';
    }
    if (g === 'color') {
      setSlider('brightness', 0); setSlider('contrast', 0); setSlider('saturation', 100); setSlider('warmth', 0);
    }
    if (g === 'orient') {
      state.rotUp = 0; state.rotDn = 0; state.flipH = false; $('flipH').checked = false; refUp(); refDn();
    }
    savePrefs();
    requestRender();
  }));

  function setExportButtonsBusy(val) {
    busy = val;
    $('btnZip').disabled = val || !state.image;
    document.querySelectorAll('#facebtns button').forEach(b => b.disabled = val || !state.image);
  }

  GL.FACES.forEach(f => {
    const b = document.createElement('button'); b.type = 'button'; b.disabled = true;
    b.textContent = 'Skybox' + f.k + '.png';
    b.addEventListener('click', async () => {
      setExportButtonsBusy(true);
      try {
        await window.ZipExport.exportOne(f, state, setStatus);
      } catch (e) {
        addBanner('error', 'Gagal mengekspor ' + f.name + ': ' + e.message + '. Coba pilih resolusi lebih kecil.');
      } finally {
        setExportButtonsBusy(false);
        renderCross();
      }
    });
    $('facebtns').appendChild(b);
  });

  $('btnZip').addEventListener('click', async () => {
    setExportButtonsBusy(true);
    try {
      await window.ZipExport.exportZip(state, setStatus);
    } catch (e) {
      addBanner('error', 'Gagal membuat ZIP: ' + e.message + '. Coba pilih resolusi 512 atau 1024 px.');
    } finally {
      setExportButtonsBusy(false);
      renderCross();
    }
  });

  const drop = $('drop'), fileInput = $('file');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  $('btnTest').addEventListener('click', () => {
    setSlider('seamBlend', 0);
    const c = window.makeTestPanorama();
    clearFlat();
    setImage(c, c.width, c.height, 'Gambar Uji', null, { skipRatioCheck: true });
  });

  const tabNames = ['cross', '3d', 'rbx', 'stitch'];
  window.Stitcher.build($('panel-stitch'));
  if (window.RobloxUpload) window.RobloxUpload.build($('rbxUploadRoot'), state, refreshLuau);
  function switchTab(name) {
    activeTab = name;
    tabNames.forEach(t => {
      const isSel = t === name;
      const tabEl = $(`tab-${t}`);
      const panelEl = $(`panel-${t}`);
      tabEl.setAttribute('aria-selected', String(isSel));
      tabEl.tabIndex = isSel ? 0 : -1;
      panelEl.hidden = !isSel;
    });

    if (name === '3d') {
      V3D.init($('stage3d'));
      V3D.setVisible(true);
      render3DTextures();
    } else {
      V3D.setVisible(false);
    }
    if (name === 'cross') requestRender();
  }

  if (location.hash === '#rbx') switchTab('rbx');

  tabNames.forEach((t, idx) => {
    const tabEl = $(`tab-${t}`);
    tabEl.addEventListener('click', () => switchTab(t));
    tabEl.addEventListener('keydown', e => {
      let targetIdx = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') targetIdx = (idx + 1) % tabNames.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') targetIdx = (idx - 1 + tabNames.length) % tabNames.length;
      if (targetIdx !== -1) {
        e.preventDefault();
        const nextName = tabNames[targetIdx];
        $(`tab-${nextName}`).focus();
        switchTab(nextName);
      }
    });
  });

  $('chkBaseplate').addEventListener('change', e => V3D.setBaseplate(e.target.checked));
  $('chkCharacter').addEventListener('change', e => V3D.setCharacter(e.target.checked));
  $('chkWireframe').addEventListener('change', e => V3D.setWireframe(e.target.checked));
  $('s_fov').addEventListener('input', e => {
    V3D.setFov(Number(e.target.value));
    $('out_fov').textContent = e.target.value;
  });
  V3D.onFovChange(fov => {
    $('s_fov').value = Math.round(fov);
    $('out_fov').textContent = Math.round(fov);
  });

  // Script muncul otomatis di tab Upload Roblox begitu ke-6 Image ID terisi (dari upload atau input manual).
  let luauShown = false;
  function refreshLuau() {
    $('luau').textContent = window.LuauGen.buildLuau(state.ids, $('celestial').checked);
    const all = GL.FACES.every(f => /^\d+$/.test(String(state.ids[f.k] || '').trim()));
    $('rbxResult').hidden = !all;
    $('decalWarn').hidden = !(all && state.uploadType === 'Decal');
    if (all && !luauShown) {
      luauShown = true;
      if (activeTab === 'rbx') $('rbxResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (!all) luauShown = false;
  }
  GL.FACES.forEach(f => {
    const row = document.createElement('div'); row.className = 'field';
    const lab = document.createElement('label'); lab.htmlFor = 'id_' + f.k; lab.textContent = f.name;
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'id_' + f.k;
    inp.inputMode = 'numeric'; inp.placeholder = 'Image ID ' + f.name;
    inp.addEventListener('input', () => { state.ids[f.k] = inp.value; state.uploadType = null; refreshLuau(); });
    row.appendChild(lab); row.appendChild(inp); $('idfields').appendChild(row);
  });
  $('celestial').addEventListener('change', refreshLuau);

  $('btnView3d').addEventListener('click', () => { switchTab('3d'); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  $('btnRbxmx').addEventListener('click', () => {
    const xml = window.LuauGen.buildRbxmx(state.ids, $('celestial').checked);
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    a.href = url; a.download = 'Sky.rbxmx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('btnCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('luau').textContent);
      $('copystatus').textContent = 'Tersalin!';
    } catch (_) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents($('luau'));
      sel.addRange(r);
      $('copystatus').textContent = 'Clipboard ditolak. Teks dipilih, tekan Ctrl+C.';
    }
    setTimeout(() => { $('copystatus').textContent = ''; }, 4000);
  });
  refreshLuau();

  // Penanganan WebGL Context Lost & Restored
  let glLostBanner = null;
  let v3dLostBanner = null;

  window.MainApp = {
    addBanner,
    loadPanorama: (c, name) => { clearFlat(); setImage(c, c.width, c.height, name, null, { skipRatioCheck: true }); switchTab('cross'); },
    onGLContextLost: () => {
      if (!glLostBanner) {
        glLostBanner = addBanner('error', 'Konteks WebGL hilang. Memulihkan grafis...');
      }
    },
    onGLRestored: () => {
      if (glLostBanner) {
        try { glLostBanner.remove(); } catch (_) {}
        glLostBanner = null;
      }
      const b = addBanner('info', 'Grafis konversi dipulihkan.');
      setTimeout(() => { try { b.remove(); } catch (_) {} }, 4000);
      if (state.image) {
        try { GL.uploadTexture(state.image.source); } catch (e) { addBanner('error', 'Gagal memuat ulang tekstur: ' + e.message); return; }
        requestRender();
        if (activeTab === '3d') render3DTextures();
      }
    },
    on3DContextLost: () => {
      if (!v3dLostBanner) {
        v3dLostBanner = addBanner('warn', 'Konteks grafis 3D hilang. Memulihkan...');
      }
    },
    on3DContextRestored: () => {
      if (v3dLostBanner) {
        try { v3dLostBanner.remove(); } catch (_) {}
        v3dLostBanner = null;
      }
      const b = addBanner('info', 'Grafis 3D dipulihkan.');
      setTimeout(() => { try { b.remove(); } catch (_) {} }, 4000);
    }
  };

  if (!GL.initGL()) {
    addBanner('error', 'WebGL tidak didukung atau dimatikan pada browser ini. Aplikasi tidak dapat berjalan.');
    $('btnTest').disabled = true;
    $('drop').style.opacity = '0.5';
  }
})();
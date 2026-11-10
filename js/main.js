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
    wmSides: ['dn'], wmAnchor: 'tengah', wmDx: 0, wmDy: 0, wmRot: 0,
    hue: 0, tint: 0,
    mirrorDn: false,
    theme: saved.theme || 'auto'
  };

  const state = Object.assign({
    image: null, exportRes: saved.exportRes || 1024,
    ids: { Ft: '', Bk: '', Lf: '', Rt: '', Up: '', Dn: '' }
  }, DEFAULTS);

  let busy = false;
  let activeTab = 'konversi';
  let showCross = false;   // panel Konversi: preview 3D (default) atau cross 2D
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
      if (showCross) renderCross();
      if (activeTab === 'konversi' && !showCross) schedule3DRender();
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
    if (!state.image || busy || activeTab !== 'konversi' || showCross) return;
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
    const pk = document.getElementById('panel-konversi'); if (pk) pk.classList.remove('no-img');
    if (typeof detectMood === 'function') detectMood();
    $('btnZip').disabled = false;
    $('btnCrossPng').disabled = false;
    document.querySelectorAll('#facebtns button').forEach(b => b.disabled = false);

    if (!opts.skipRatioCheck) {
      const ratio = w / h;
      if (Math.abs(ratio - 2.0) / 2.0 <= 0.05 && flat.mode === 'pano') {
        addBanner('info', 'Gambar 2:1 dipakai apa adanya sebagai panorama. Kalau hasilnya berpilin/jepit di satu titik (panorama palsu dari AI), ganti "Jenis gambar" ke "Gambar biasa" di Pengaturan agar diproyeksikan ulang — atau regenerate pakai template [Ganti Ini] di tab AI Prompt.');
      }
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
    if (activeTab === 'konversi' && !showCross) render3DTextures();
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
  const flat = { src: null, w: 0, h: 0, name: '', size: null, mode: '2d', kind: 'scene', fov: 100, offset: 0, edge: 18, fill: 'hybrid', smooth: 30, vOff: 0 };
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
      state.vOff = flat.vOff;
      let src = flat.src, w = flat.w, h = flat.h;
      if (flat.smooth > 0 && window.Flat2Pano.smoothPoles) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(flat.src, 0, 0, w, h);
        window.Flat2Pano.smoothPoles(c, 0.12, flat.smooth / 100);
        src = c;
      }
      setImage(src, w, h, flat.name, flat.size, { skipRatioCheck: true });
      return;
    }
    const token = ++flatToken;
    const note = $('flatNote');
    note.textContent = 'Memproses panorama…';
    setTimeout(() => {
      if (token !== flatToken) return;
      try {
        const optPano = {
          fov: flat.fov, pitch: flatPitch(), edge: flat.edge, maxW: Math.min(4096, GL.getMaxTex())
        };
        const c = window.Flat2Pano.convert(flat.src, flat.w, flat.h, Object.assign(optPano, { fill: flat.fill }));
        if (token !== flatToken) return;
        setImage(c, c.width, c.height, flat.name + ' [2D→360°]', flat.size, { skipRatioCheck: true });
        note.textContent = flat.fill === 'hybrid'
          ? 'Hybrid selesai: gambar asli dipertahankan, area luar diperluas dengan push-pull + mirror extension, lalu dibaurkan agar panorama menyambung 360°.'
          : flat.fill === 'cermin'
            ? 'Mode Cermin selesai: area luar diperluas dengan mirror extension dan blur agar menyambung 360°.'
            : 'Mode Halus selesai: area luar diisi dengan push-pull dan blur agar menyambung 360°.';
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
    () => flat.mode, v => {
      flat.mode = v;
      $('flatCtl').hidden = v !== '2d';
      $('grpPanoCtl').hidden = v !== 'pano';
      state.vOff = 0;
      applyFlat();
    });
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
    $('grpPanoCtl').hidden = flat.mode !== 'pano';
  }
  $('flatFill').addEventListener('change', e => { flat.fill = e.target.value; scheduleFlat(); });
  $('s_polesmooth').addEventListener('input', e => {
    flat.smooth = Number(e.target.value);
    $('out_polesmooth').textContent = flat.smooth + '%';
    if (flat.mode === 'pano') scheduleFlat();
  });
  $('s_voff').addEventListener('input', e => {
    flat.vOff = Number(e.target.value);
    $('out_voff').textContent = flat.vOff + '°';
    state.vOff = flat.vOff;
    requestRender();
  });

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
  addSlider($('grpColor'), 'hue', 'Hue Rotate', -180, 180, 1, '°');
  addSlider($('grpColor'), 'tint', 'Tint (Hijau ↔ Magenta)', -100, 100, 1, '');

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

  // Sisi tempat watermark muncul (pilih banyak), jangkar posisi, geser & rotasi.
  (function buildWmExtras() {
    const seglabel = document.createElement('div');
    seglabel.className = 'seglabel';
    seglabel.textContent = 'Sisi yang diberi logo (bisa lebih dari satu)';
    $('grpWm2').appendChild(seglabel);
    const chipRow = document.createElement('div');
    chipRow.className = 'row';
    chipRow.style.flexWrap = 'wrap';
    chipRow.style.gap = '6px';
    $('grpWm2').appendChild(chipRow);
    GL.FACES.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = f.name;
      b.dataset.side = f.k.toLowerCase();
      b.addEventListener('click', () => {
        const k = b.dataset.side;
        const i = state.wmSides.indexOf(k);
        if (i >= 0) state.wmSides.splice(i, 1); else state.wmSides.push(k);
        if (!state.wmSides.length) state.wmSides = ['dn'];
        refreshWmChips();
        requestRender();
      });
      chipRow.appendChild(b);
    });
    function refreshWmChips() {
      chipRow.querySelectorAll('button').forEach(b =>
        b.setAttribute('aria-pressed', String(state.wmSides.includes(b.dataset.side))));
    }
    refreshWmChips();

    const anchorWrap = document.createElement('div');
    anchorWrap.className = 'slider';
    const anchorLab = document.createElement('label');
    anchorLab.htmlFor = 'wmAnchor';
    anchorLab.textContent = 'Posisi logo';
    const anchorSel = document.createElement('select');
    anchorSel.id = 'wmAnchor';
    anchorSel.style.cssText = 'min-height:36px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--text)';
    [['tengah', 'Tengah'], ['kiri-atas', 'Kiri atas'], ['kanan-atas', 'Kanan atas'], ['kiri-bawah', 'Kiri bawah'], ['kanan-bawah', 'Kanan bawah']]
      .forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; anchorSel.appendChild(o); });
    anchorSel.value = state.wmAnchor;
    anchorSel.addEventListener('change', () => { state.wmAnchor = anchorSel.value; requestRender(); });
    anchorWrap.appendChild(anchorLab);
    anchorWrap.appendChild(anchorSel);
    $('grpWm2').appendChild(anchorWrap);

    addSlider($('grpWm2'), 'wmDx', 'Geser horizontal', -20, 20, 1, '%');
    addSlider($('grpWm2'), 'wmDy', 'Geser vertikal', -20, 20, 1, '%');
    addSlider($('grpWm2'), 'wmRot', 'Rotasi logo', 0, 359, 1, '°');
  })();

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

  makeSeg($('segRes'), [512, 1024, 2048, 4096], v => v + ' px', () => state.exportRes, v => {
    state.exportRes = v;
    if (activeTab === 'konversi' && !showCross) schedule3DRender();
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
      setSlider('hue', 0); setSlider('tint', 0);
    }
    if (g === 'orient') {
      state.rotUp = 0; state.rotDn = 0; state.flipH = false; state.mirrorDn = false;
      $('flipH').checked = false; $('mirrorDn').checked = false; refUp(); refDn();
    }
    savePrefs();
    requestRender();
  }));

  function setExportButtonsBusy(val) {
    busy = val;
    $('btnZip').disabled = val || !state.image;
    $('btnCrossPng').disabled = val || !state.image;
    document.querySelectorAll('#facebtns button').forEach(b => b.disabled = val || !state.image);
  }

  GL.FACES.forEach(f => {
    const b = document.createElement('button'); b.type = 'button'; b.disabled = true;
    // Nama file mengikuti properti Roblox yang diisi gambarnya (SkyboxRt.png = render sisi kiri, dst).
    b.textContent = 'Skybox' + GL.ROBLOX_PROPERTY[f.k] + '.png';
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

  $('btnCrossPng').addEventListener('click', async () => {
    setExportButtonsBusy(true);
    try {
      await window.ZipExport.exportCross(state, setStatus);
    } catch (e) {
      addBanner('error', 'Gagal membuat atlas cross: ' + e.message);
    } finally {
      setExportButtonsBusy(false);
      if (showCross) renderCross();
    }
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

  const tabNames = ['konversi', 'roblox', 'alat', 'prompt'];
  window.Stitcher.build($('panel-stitch'));
  window.BatchConvert.build($('panel-batch'), state, () => requestRender());
  window.PromptLib.build($('panel-prompt'));
  if (window.RobloxUpload) window.RobloxUpload.build($('rbxWizard'), state, refreshLuau);

  // Sub-tab di panel Alat: Stitcher / Batch
  $('tab-sub-stitch').addEventListener('click', () => {
    $('sub-stitch').hidden = false; $('sub-batch').hidden = true;
    $('tab-sub-stitch').classList.add('primary'); $('tab-sub-batch').classList.remove('primary');
    $('tab-sub-stitch').setAttribute('aria-pressed', 'true'); $('tab-sub-batch').setAttribute('aria-pressed', 'false');
  });
  $('tab-sub-batch').addEventListener('click', () => {
    $('sub-stitch').hidden = true; $('sub-batch').hidden = false;
    $('tab-sub-batch').classList.add('primary'); $('tab-sub-stitch').classList.remove('primary');
    $('tab-sub-batch').setAttribute('aria-pressed', 'true'); $('tab-sub-stitch').setAttribute('aria-pressed', 'false');
  });

  // Toggle preview Cross 2D di dalam tab Konversi (default: 3D).
  $('btnCrossToggle').addEventListener('click', () => {
    showCross = !showCross;
    $('crossWrap').hidden = !showCross;
    $('btnCrossToggle').textContent = showCross ? 'Kembali ke 3D' : 'Lihat Cross 2D';
    if (showCross) {
      V3D.setVisible(false);
      requestRender();
    } else {
      V3D.setVisible(true);
      render3DTextures();
    }
  });

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

    if (name === 'konversi') {
      V3D.init($('stage3d'));
      V3D.setVisible(!showCross);
      if (showCross) requestRender(); else render3DTextures();
    } else {
      V3D.setVisible(false);
    }
  }

  if (location.hash === '#rbx' || location.hash === '#roblox') switchTab('roblox');

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
    $('luau').textContent = window.LuauGen.buildLuau(state.ids, $('celestial').checked, Object.assign(atmOpts(), lightingOpts()));
    const all = GL.FACES.every(f => /^\d+$/.test(String(state.ids[f.k] || '').trim()));
    $('rbxResult').hidden = !all;
    $('decalWarn').hidden = !(all && state.uploadType === 'Decal');
    if (all) {
      buildSkyPack();          // bangun UI sekali; pemanggilan berikutnya no-op
      if (buildSkyPack.renderList) buildSkyPack.renderList();
    }
    if (all && !luauShown) {
      luauShown = true;
      if (activeTab === 'roblox') $('rbxResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (!all) luauShown = false;
  }
  GL.FACES.forEach(f => {
    const row = document.createElement('div'); row.className = 'field';
    // Kolom ID memakai nama properti Roblox (SkyboxLf dst.) supaya cocok dengan Asset Manager.
    const lab = document.createElement('label'); lab.htmlFor = 'id_' + f.k; lab.textContent = 'Skybox' + f.k;
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'id_' + f.k;
    inp.inputMode = 'numeric'; inp.placeholder = 'Image ID Skybox' + f.k;
    inp.addEventListener('input', () => { state.ids[f.k] = inp.value; state.uploadType = null; refreshLuau(); });
    row.appendChild(lab); row.appendChild(inp); $('idfields').appendChild(row);
  });
  $('celestial').addEventListener('change', refreshLuau);
  $('withAtm').addEventListener('change', () => { $('atmPresetRow').hidden = !$('withAtm').checked; refreshLuau(); });
  $('atmPreset').addEventListener('change', refreshLuau);
  const atmOpts = () => ({ atmosphere: $('withAtm').checked ? $('atmPreset').value : 'none' });

  // Profil pencahayaan: mood terdeteksi otomatis dari kecerahan panorama.
  let moodDetected = null;
  function detectMood() {
    if (!state.image || !state.image.source) return null;
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(state.image.source, 0, 0, 64, 32);
      const d = g.getImageData(0, 0, 64, 32).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sum += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114); n++; }
      const lum = sum / n;
      moodDetected = lum < 55 ? 'malam' : lum < 105 ? 'horor' : lum < 158 ? 'senja' : 'siang';
      return moodDetected;
    } catch (e) { return null; }
  }
  $('withLight').addEventListener('change', () => { $('lightRow').hidden = !$('withLight').checked; refreshLuau(); });
  $('lightProfile').addEventListener('change', refreshLuau);
  const lightingOpts = () => {
    if (!$('withLight').checked) return { lighting: 'none' };
    const v = $('lightProfile').value;
    return { lighting: v === 'auto' ? (moodDetected || detectMood() || 'siang') : v };
  };

  $('btnView3d').addEventListener('click', () => {
    switchTab('konversi');
    if (showCross) $('btnCrossToggle').click();   // kembali ke tampilan 3D
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Langit contoh prosedural untuk empty state — kartu visual dengan thumbnail.
  if (window.SampleSkies) {
    const smpLabel = { siang: 'Siang Cerah', senja: 'Senja', malam: 'Malam Berbintang', aurora: 'Aurora', nebula: 'Nebula', horor: 'Kabut Horor' };
    window.SampleSkies.kinds.forEach(kind => {
      const b = $('smp' + kind.charAt(0).toUpperCase() + kind.slice(1));
      if (!b) return;
      const c = window.SampleSkies.make(kind);
      const thumb = document.createElement('canvas');
      thumb.width = 384; thumb.height = 192;
      thumb.getContext('2d').drawImage(c, 0, 0, 384, 192);
      const img = new Image();
      img.src = thumb.toDataURL('image/jpeg', 0.82);
      img.alt = '';
      b.textContent = '';
      b.classList.add('smp');
      b.appendChild(img);
      const sp = document.createElement('span');
      sp.textContent = 'Coba: ' + (smpLabel[kind] || kind);
      b.appendChild(sp);
      b.addEventListener('click', () => {
        setImage(c, c.width, c.height, 'Langit contoh (' + kind + ')', null, { skipRatioCheck: true });
      });
    });
  }

  $('mirrorDn').addEventListener('change', e => { state.mirrorDn = e.target.checked; requestRender(); });

  // ── Mode Studio: chrome ala Roblox Studio di sekeliling preview 3D ──
  function buildStudioHud() {
    const stage = document.getElementById('stage3d');
    if (!stage || document.getElementById('studioHud')) return;
    const mk = (tag, cls, html) => {
      const e = document.createElement('div');
      e.className = cls; e.innerHTML = html;
      return e;
    };
    const hud = mk('div', 'studio-hud', '');
    hud.id = 'studioHud';

    // ribbon atas
    hud.appendChild(mk('div', 'hud-ribbon',
      '<span class="hud-tabs"><b class="on">Home</b><b>Model</b><b>Avatar</b><b>Test</b><b>View</b><b>Plugins</b></span>' +
      '<span class="hud-tools">click &#183; move &#183; scale &#183; rotate &#183; transform</span>'));

    // explorer + properties kanan
    hud.appendChild(mk('div', 'hud-right',
      '<div class="hud-panel"><div class="hud-ptitle">Explorer</div>' +
      '<div class="hud-tree">' +
      '<div>&#9654; &#127760; Workspace</div>' +
      '<div class="sub">&#9635; Baseplate</div>' +
      '<div class="sub">&#9635; SpawnLocation</div>' +
      '<div class="sub sel">&#128100; NAKA Character</div>' +
      '<div class="sub sel">&#127724; Sky</div>' +
      '<div>&#9654; &#128161; Lighting</div>' +
      '</div></div>' +
      '<div class="hud-panel"><div class="hud-ptitle">Properties</div>' +
      '<div class="hud-prop"><span>Name</span><b>Sky</b></div>' +
      '<div class="hud-prop"><span>Class</span><b>Sky</b></div>' +
      '<div class="hud-prop"><span>StarCount</span><b>3000</b></div>' +
      '<div class="hud-prop"><span>CelestialBodies</span><b>true</b></div>' +
      '</div>'));

    // output bawah
    hud.appendChild(mk('div', 'hud-output',
      '<div>&#9654; NAKA Studio preview aktif &mdash; drag untuk memutar, scroll untuk FOV.</div>' +
      '<div class="dim">Skybox dipasang via Lighting. Tekan Play untuk melihat hasil di game.</div>'));

    // view cube + koordinat kamera
    hud.appendChild(mk('div', 'hud-viewcube', '<b>FRONT</b><span>&#9633;</span>'));
    hud.appendChild(mk('div', 'hud-cam', ''));
    const cam = hud.querySelector('.hud-cam');
    cam.id = 'hudCam';

    stage.appendChild(hud);

    // readout koordinat live dari kamera
    if (window.Viewer3D && window.Viewer3D.onCameraMove) {
      window.Viewer3D.onCameraMove((pos, fov) => {
        cam.textContent = 'X ' + pos.x.toFixed(1) + '   Y ' + pos.y.toFixed(1) + '   Z ' + pos.z.toFixed(1) + '   |   FOV ' + Math.round(fov) + '°';
      });
    }
    // toggle
    const chk = document.getElementById('chkStudio');
    if (chk) {
      const apply = () => { hud.style.display = chk.checked ? '' : 'none'; };
      chk.addEventListener('change', apply);
      apply();
    }
  }

  // Inisialisasi tab default (Konversi): siapkan preview 3D sejak awal supaya
  // langit contoh / gambar pertama langsung tampil tanpa perlu klik tab dulu.
  switchTab('konversi');
  // HUD Studio dibangun SETELAH V3D.init (init mengosongkan container stage3d).
  buildStudioHud();

  // ---------- Paket Ganti-Langit (dari riwayat upload) ----------
  // Satu .rbxmx berisi folder SkyboxSets (satu Sky per skybox pilihan) + script
  // switcher yang bisa dipasang di ServerScriptService untuk berganti langit dari game.
  let skyPackBuilt = false;
  function buildSkyPack() {
    const root = $('skyPackRoot');
    if (!root || skyPackBuilt) return;
    skyPackBuilt = true;
    const det = document.createElement('details');
    det.className = 'group';
    const sum = document.createElement('summary');
    sum.textContent = 'Paket Ganti-Langit (multi-skybox untuk game)';
    det.appendChild(sum);
    root.appendChild(det);

    const note = document.createElement('p');
    note.className = 'note';
    note.style.marginTop = '6px';
    note.textContent = 'Gabungkan beberapa skybox dari riwayat upload jadi satu paket: satu file .rbxmx berisi folder "SkyboxSets" + script yang bisa berganti langit dari dalam game (cocok untuk game multi-map).';
    det.appendChild(note);

    const listBox = document.createElement('div');
    listBox.id = 'skyPackList';
    det.appendChild(listBox);

    const row = document.createElement('div');
    row.className = 'row';
    det.appendChild(row);
    const btnPack = document.createElement('button');
    btnPack.type = 'button';
    btnPack.className = 'primary';
    btnPack.textContent = 'Unduh .rbxmx Paket';
    const btnSwitch = document.createElement('button');
    btnSwitch.type = 'button';
    btnSwitch.textContent = 'Salin Script Ganti-Langit';
    const st = document.createElement('span');
    st.id = 'skyPackStatus';
    st.style.cssText = 'font-size:13px;color:var(--muted)';
    row.appendChild(btnPack);
    row.appendChild(btnSwitch);
    row.appendChild(st);

    function selectedEntries() {
      return Array.from(listBox.querySelectorAll('input:checked'))
        .map(cb => ({ name: cb.dataset.name, ids: JSON.parse(cb.dataset.ids) }));
    }
    function renderList() {
      listBox.textContent = '';
      const hist = (window.Vault && window.Vault.history) ? window.Vault.history() : [];
      const seen = new Set();
      const entries = [];
      hist.forEach(h => {
        if (!h.ids || seen.has(h.ids.Ft + '|' + h.ids.Up)) return;   // buang duplikat persis
        seen.add(h.ids.Ft + '|' + h.ids.Up);
        entries.push({ name: h.base, ids: h.ids, t: h.t });
      });
      if (!entries.length) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = 'Belum ada riwayat upload. Selesaikan satu upload (atau isi 6 ID manual), lalu daftar skybox akan muncul di sini.';
        listBox.appendChild(p);
        btnPack.disabled = true;
        btnSwitch.disabled = true;
        return;
      }
      entries.forEach((e, i) => {
        const lab = document.createElement('label');
        lab.className = 'check';
        lab.style.display = 'flex';
        lab.style.alignItems = 'center';
        lab.style.gap = '6px';
        lab.style.margin = '4px 0';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = i === 0;
        cb.dataset.name = e.name;
        cb.dataset.ids = JSON.stringify(e.ids);
        lab.appendChild(cb);
        const sp = document.createElement('span');
        sp.textContent = e.name + ' · ' + new Date(e.t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        lab.appendChild(sp);
        listBox.appendChild(lab);
      });
      btnPack.disabled = false;
      btnSwitch.disabled = false;
    }
    renderList();
    buildSkyPack.renderList = renderList;   // biar daftar bisa di-refresh dari refreshLuau

    btnPack.addEventListener('click', () => {
      const entries = selectedEntries();
      if (!entries.length) { st.textContent = 'Pilih minimal satu skybox.'; return; }
      const xml = window.LuauGen.buildSkyPackRbxmx(entries);
      const a = document.createElement('a');
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      a.href = url; a.download = 'SkyboxSets.rbxmx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      st.textContent = entries.length + ' skybox dalam paket.';
    });
    btnSwitch.addEventListener('click', async () => {
      const entries = selectedEntries();
      if (!entries.length) { st.textContent = 'Pilih minimal satu skybox.'; return; }
      const lua = window.LuauGen.buildSkySwitcherLua(entries);
      try {
        await navigator.clipboard.writeText(lua);
        st.textContent = 'Script ganti-langit tersalin! Buat Script di ServerScriptService, paste, jalankan.';
      } catch (_) {
        st.textContent = 'Clipboard ditolak — salin manual dari console (F12).';
        console.log('--- Script Ganti-Langit ---\n' + lua);
      }
      setTimeout(() => { st.textContent = ''; }, 6000);
    });
  }

  $('btnRbxmx').addEventListener('click', () => {
    const xml = window.LuauGen.buildRbxmx(state.ids, $('celestial').checked, Object.assign(atmOpts(), lightingOpts()));
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    a.href = url; a.download = 'Sky.rbxmx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('btnCopyIds').addEventListener('click', async () => {
    const NL = String.fromCharCode(10);
    const lines = window.GLConvert.FACES.map(f => {
      const v = String(state.ids[f.k] || '').replace(/[^0-9]/g, '');
      return 'Skybox' + f.k + ' = ' + (v || '(belum ada)');
    }).join(NL);
    const txt = '=== Image ID Skybox (NAKA Studio) ===' + NL + lines + NL;
    try {
      await navigator.clipboard.writeText(txt);
      $('copystatus').textContent = '6 ID tersalin!';
    } catch (_) {
      $('copystatus').textContent = 'Clipboard ditolak — salin manual dari console.';
      console.log(txt);
    }
    setTimeout(() => { $('copystatus').textContent = ''; }, 4000);
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

  // Nudge keyboard: panah menggeser yaw/pitch (Shift = 5°). Abaikan saat fokus di input.
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!state.image) return;
    const step = e.shiftKey ? 5 : 1;
    let handled = false;
    if (e.key === 'ArrowLeft') { state.yaw = (state.yaw - step + 360) % 360; handled = true; }
    else if (e.key === 'ArrowRight') { state.yaw = (state.yaw + step) % 360; handled = true; }
    else if (e.key === 'ArrowUp') { state.pitch = Math.max(-45, state.pitch - step); handled = true; }
    else if (e.key === 'ArrowDown') { state.pitch = Math.min(45, state.pitch + step); handled = true; }
    if (handled) {
      e.preventDefault();
      if (sliders.yaw) { sliders.yaw.inp.value = state.yaw; sliders.yaw.show(); }
      if (sliders.pitch) { sliders.pitch.inp.value = state.pitch; sliders.pitch.show(); }
      requestRender();
    }
  });

  // ── Ekspor / Impor konfigurasi (JSON) — pengaturan bisa disimpan & dibagikan ──
  const CFG_KEYS = ['yaw', 'pitch', 'horizon', 'fadeHorizon', 'fadeColor', 'brightness', 'contrast',
    'saturation', 'warmth', 'hue', 'tint', 'seamBlend', 'fadeTop', 'fadeTopColor',
    'rotUp', 'rotDn', 'flipH', 'mirrorDn', 'wmSides', 'wmAnchor', 'wmDx', 'wmDy', 'wmRot',
    'watermarkScale', 'watermarkOpacity', 'exportRes'];
  $('btnCfgExport').addEventListener('click', () => {
    const cfg = { _app: 'naka-studio-config', _v: 1, image: state.image ? state.image.name : null };
    CFG_KEYS.forEach(k => { cfg[k] = state[k]; });
    const url = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'naka-sky-config.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  function applyConfig(cfg) {
    if (!cfg || cfg._app !== 'naka-studio-config') throw new Error('File bukan konfigurasi NAKA Studio.');
    CFG_KEYS.forEach(k => { if (k in cfg) state[k] = cfg[k]; });
    CFG_KEYS.forEach(k => { if (sliders[k]) { sliders[k].inp.value = state[k]; sliders[k].show(); } });
    $('fadeColor').value = state.fadeColor;
    $('fadeTopColor').value = state.fadeTopColor;
    $('flipH').checked = !!state.flipH;
    $('mirrorDn').checked = !!state.mirrorDn;
    refUp(); refDn();
    savePrefs();
    requestRender();
    if (activeTab === 'konversi' && !showCross) render3DTextures();
    addBanner('info', 'Konfigurasi diterapkan' + (cfg.image ? ' (asal: ' + cfg.image + ')' : '') + '.');
  }
  $('btnCfgImport').addEventListener('click', () => $('cfgFile').click());
  $('cfgFile').addEventListener('change', () => {
    const f = $('cfgFile').files[0];
    $('cfgFile').value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { applyConfig(JSON.parse(String(rd.result))); }
      catch (e) { addBanner('error', 'Gagal impor konfigurasi: ' + e.message); }
    };
    rd.readAsText(f);
  });

  // Penanganan WebGL Context Lost & Restored
  let glLostBanner = null;
  let v3dLostBanner = null;

  window.MainApp = {
    addBanner,
    loadPanorama: (c, name) => { clearFlat(); setImage(c, c.width, c.height, name, null, { skipRatioCheck: true }); switchTab('konversi'); },
    // Dipakai Batch Convert: pulihkan tekstur preview utama setelah GPU dipakai untuk batch.
    refreshPreview: () => {
      if (state.image && state.image.source) {
        try { GL.uploadTexture(state.image.source); } catch (_) {}
      }
      requestRender();
      if (activeTab === 'konversi' && !showCross) render3DTextures();
    },
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
        if (activeTab === 'konversi' && !showCross) render3DTextures();
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
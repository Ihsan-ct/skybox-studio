"use strict";
(function () {
  const $ = id => document.getElementById(id);
  const GL = window.GLConvert;

  const DEFAULTS = { yaw: 0, pitch: 0, brightness: 0, contrast: 0, saturation: 100, rotUp: 0, rotDn: 0, flipH: false };

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('skybox_prefs') || '{}');
      return {
        exportRes: p.exportRes || 1024,
        rotUp: typeof p.rotUp === 'number' ? p.rotUp : 0,
        rotDn: typeof p.rotDn === 'number' ? p.rotDn : 0
      };
    } catch (e) {
      return { exportRes: 1024, rotUp: 0, rotDn: 0 };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem('skybox_prefs', JSON.stringify({
        exportRes: state.exportRes, rotUp: state.rotUp, rotDn: state.rotDn
      }));
    } catch (e) {}
  }

  const prefs = loadPrefs();
  const state = Object.assign({
    image: null, exportRes: prefs.exportRes,
    ids: { Ft: '', Bk: '', Lf: '', Rt: '', Up: '', Dn: '' }
  }, DEFAULTS, { rotUp: prefs.rotUp, rotDn: prefs.rotDn });

  let busy = false;
  const PREVIEW = 256;

  function setStatus(text) { $('status').textContent = text || ''; }

  function addBanner(kind, text, acts) {
    const el = document.createElement('div'); el.className = 'banner ' + kind;
    const msg = document.createElement('div'); msg.className = 'msg';
    const t = document.createElement('div'); t.textContent = text; msg.appendChild(t);
    if (acts && acts.length) {
      const a = document.createElement('div'); a.className = 'acts';
      acts.forEach(act => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = act.label;
        b.addEventListener('click', () => { act.fn(); el.remove(); });
        a.appendChild(b);
      });
      msg.appendChild(a);
    }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x';
    x.textContent = '×'; x.addEventListener('click', () => el.remove());
    el.appendChild(msg); el.appendChild(x);
    $('banners').appendChild(el);
  }
  function clearBanners() { $('banners').textContent = ''; }

  const cross = $('cross');
  cross.width = PREVIEW * 4; cross.height = PREVIEW * 3;
  const cctx = cross.getContext('2d');
  let rafPending = false;

  function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderAll();
    });
  }

  function renderAll() {
    if (!state.image || busy) return;
    GL.setSize(PREVIEW);
    cctx.fillStyle = '#0d0f14'; cctx.fillRect(0, 0, cross.width, cross.height);

    GL.FACES.forEach(f => {
      GL.drawFace(f, PREVIEW, state);
      cctx.drawImage(GL.glCanvas, f.cell[0] * PREVIEW, f.cell[1] * PREVIEW);

      const c = document.createElement('canvas'); c.width = PREVIEW; c.height = PREVIEW;
      c.getContext('2d').drawImage(GL.glCanvas, 0, 0);
      window.Viewer3D.updateFaceTexture(f.k, c);
    });
  }

  function setImage(src, w, h, name, size, opts = {}) {
    if (!opts.keepBanners) clearBanners();
    if (!w || !h || w <= 0 || h <= 0) {
      addBanner('error', 'Dimensi berkas tidak valid.'); return;
    }
    let source = src, nw = w, nh = h;
    const maxTex = GL.getMaxTex();
    if (w > maxTex || h > maxTex) {
      const s = Math.min(maxTex / w, maxTex / h);
      nw = Math.max(1, Math.floor(w * s)); nh = Math.max(1, Math.floor(h * s));
      const c = document.createElement('canvas'); c.width = nw; c.height = nh;
      c.getContext('2d').drawImage(src, 0, 0, nw, nh);
      source = c;
      addBanner('info', `Gambar terlalu besar untuk GPU ini. Dikecilkan otomatis ke ${nw}×${nh} px.`);
    }

    state.image = { source, width: nw, height: nh, name, size, origW: opts.origW || w, origH: opts.origH || h };
    try { GL.uploadTexture(source); }
    catch (e) { addBanner('error', e.message); return; }

    $('fileinfo').textContent = `${name} · ${nw}×${nh} px`;
    $('empty').hidden = true;
    $('btnZip').disabled = false;
    document.querySelectorAll('#facebtns button').forEach(b => b.disabled = false);

    if (!opts.skipRatio) {
      const r = nw / nh;
      if (Math.abs(r - 2) / 2 > 0.05) {
        addBanner('warn', `Rasio gambar ${r.toFixed(2)}:1, bukan 2:1.`, [
          { label: 'Biarkan', fn: () => {} },
          { label: 'Crop 2:1', fn: () => fitRatio('crop') },
          { label: 'Pad 2:1', fn: () => fitRatio('pad') }
        ]);
      }
    }
    requestRender();
  }

  function fitRatio(mode) {
    const im = state.image; if (!im) return;
    let cw, ch;
    if (mode === 'crop') {
      if (im.width / im.height > 2) { ch = im.height; cw = im.height * 2; }
      else { cw = im.width; ch = Math.floor(im.width / 2); }
    } else {
      if (im.width / im.height > 2) { cw = im.width; ch = Math.ceil(im.width / 2); }
      else { ch = im.height; cw = im.height * 2; }
    }
    cw = Math.max(1, cw); ch = Math.max(1, ch);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    g.drawImage(im.source, Math.floor((cw - im.width) / 2), Math.floor((ch - im.height) / 2));
    setImage(c, cw, ch, im.name + ` (${mode} 2:1)`, im.size, { skipRatio: true, origW: im.origW, origH: im.origH, keepBanners: true });
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      addBanner('error', 'Pilih berkas JPG, PNG, atau WebP.'); return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); setImage(img, img.naturalWidth, img.naturalHeight, file.name, file.size); };
    img.onerror = () => { URL.revokeObjectURL(url); addBanner('error', 'Berkas gambar rusak.'); };
    img.src = url;
  }

  const sliders = {};
  function addSlider(parent, key, label, min, max, step, unit) {
    const wrap = document.createElement('div'); wrap.className = 'slider';
    const lab = document.createElement('label'); lab.htmlFor = 's_' + key; lab.textContent = label;
    const out = document.createElement('output'); out.htmlFor = 's_' + key;
    const inp = document.createElement('input'); inp.type = 'range'; inp.id = 's_' + key;
    inp.min = min; inp.max = max; inp.step = step; inp.value = state[key];
    const show = () => { out.textContent = state[key] + unit; };
    inp.addEventListener('input', () => { state[key] = Number(inp.value); show(); requestRender(); });
    wrap.appendChild(lab); wrap.appendChild(out); wrap.appendChild(inp);
    parent.appendChild(wrap);
    sliders[key] = { inp, show };
    show();
  }
  function setSlider(k, v) { state[k] = v; sliders[k].inp.value = v; sliders[k].show(); }

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

  addSlider($('grpPos'), 'yaw', 'Yaw (horizontal)', 0, 360, 1, '°');
  addSlider($('grpPos'), 'pitch', 'Pitch (vertikal)', -45, 45, 1, '°');
  addSlider($('grpColor'), 'brightness', 'Brightness', -100, 100, 1, '');
  addSlider($('grpColor'), 'contrast', 'Contrast', -100, 100, 1, '');
  addSlider($('grpColor'), 'saturation', 'Saturation', 0, 200, 1, '%');

  makeSeg($('segRes'), [512, 1024, 2048], v => v + ' px', () => state.exportRes, v => { state.exportRes = v; });
  const refUp = makeSeg($('segUp'), [0, 90, 180, 270], v => v + '°', () => state.rotUp, v => { state.rotUp = v; requestRender(); });
  const refDn = makeSeg($('segDn'), [0, 90, 180, 270], v => v + '°', () => state.rotDn, v => { state.rotDn = v; requestRender(); });
  $('flipH').addEventListener('change', e => { state.flipH = e.target.checked; requestRender(); });

  document.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.reset;
    if (g === 'pos') { setSlider('yaw', 0); setSlider('pitch', 0); }
    if (g === 'color') { setSlider('brightness', 0); setSlider('contrast', 0); setSlider('saturation', 100); }
    if (g === 'orient') { state.rotUp = 0; state.rotDn = 0; state.flipH = false; $('flipH').checked = false; refUp(); refDn(); savePrefs(); }
    requestRender();
  }));

  GL.FACES.forEach(f => {
    const b = document.createElement('button'); b.type = 'button'; b.disabled = true;
    b.textContent = 'Skybox' + f.k + '.png';
    b.addEventListener('click', () => window.ZipExport.exportOne(f, state, setStatus));
    $('facebtns').appendChild(b);
  });

  $('btnZip').addEventListener('click', async () => {
    busy = true; $('btnZip').disabled = true;
    try { await window.ZipExport.exportZip(state, setStatus); }
    catch (e) { addBanner('error', e.message); }
    finally { busy = false; $('btnZip').disabled = false; renderAll(); }
  });

  const drop = $('drop'), fileInput = $('file');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  document.addEventListener('paste', e => {
    const it = e.clipboardData && e.clipboardData.items;
    if (it) for (let i = 0; i < it.length; i++) if (it[i].kind === 'file') loadFile(it[i].getAsFile());
  });

  $('btnTest').addEventListener('click', () => {
    const c = window.makeTestPanorama();
    setImage(c, c.width, c.height, 'Gambar Uji', null);
  });

  function switchTab(name) {
    ['cross', '3d', 'luau'].forEach(t => {
      const isSel = t === name;
      $(`tab-${t}`).setAttribute('aria-selected', String(isSel));
      $(`panel-${t}`).hidden = !isSel;
    });
    if (name === '3d') {
      window.Viewer3D.init($('stage3d'));
      window.Viewer3D.onResize();
      renderAll();
    }
    if (name === 'cross') requestRender();
  }

  $('tab-cross').addEventListener('click', () => switchTab('cross'));
  $('tab-3d').addEventListener('click', () => switchTab('3d'));
  $('tab-luau').addEventListener('click', () => switchTab('luau'));

  $('chkBaseplate').addEventListener('change', e => window.Viewer3D.setBaseplate(e.target.checked));
  $('chkWireframe').addEventListener('change', e => window.Viewer3D.setWireframe(e.target.checked));
  $('s_fov').addEventListener('input', e => {
    window.Viewer3D.setFov(Number(e.target.value));
    $('out_fov').textContent = e.target.value;
  });

  function refreshLuau() {
    $('luau').textContent = window.LuauGen.buildLuau(state.ids, $('celestial').checked);
  }
  GL.FACES.forEach(f => {
    const row = document.createElement('div'); row.className = 'field';
    const lab = document.createElement('label'); lab.htmlFor = 'id_' + f.k; lab.textContent = f.name;
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'id_' + f.k;
    inp.inputMode = 'numeric'; inp.placeholder = 'Image ID ' + f.name;
    inp.addEventListener('input', () => { state.ids[f.k] = inp.value; refreshLuau(); });
    row.appendChild(lab); row.appendChild(inp); $('idfields').appendChild(row);
  });
  $('celestial').addEventListener('change', refreshLuau);
  $('btnCopy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('luau').textContent);
    $('copystatus').textContent = 'Tersalin.';
  });
  refreshLuau();

  if (!GL.initGL()) {
    addBanner('error', 'WebGL tidak didukung browser ini.');
    $('btnTest').disabled = true;
  }
})();

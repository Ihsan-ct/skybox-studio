"use strict";
(function () {
  const $ = id => document.getElementById(id);
  const GL = window.GLConvert;

  const DEFAULTS = {
    yaw: 0, pitch: 0, horizon: 0, brightness: 0, contrast: 0, saturation: 100, warmth: 0,
    rotUp: 0, rotDn: 0, flipH: false,
    watermarkImg: null, watermarkScale: 25, watermarkOpacity: 50
  };

  const state = Object.assign({
    image: null, exportRes: 1024,
    ids: { Ft: '', Bk: '', Lf: '', Rt: '', Up: '', Dn: '' }
  }, DEFAULTS);

  let busy = false;
  const PREVIEW = 256;

  function setStatus(text) { $('status').textContent = text || ''; }
  function addBanner(kind, text) {
    const el = document.createElement('div'); el.className = 'banner ' + kind;
    el.innerHTML = `<div class="msg"><div>${text}</div></div><button class="x">×</button>`;
    el.querySelector('.x').onclick = () => el.remove();
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
      
      const c = document.createElement('canvas'); c.width = PREVIEW; c.height = PREVIEW;
      const ctx = c.getContext('2d');
      ctx.drawImage(GL.glCanvas, 0, 0);
      GL.applyWatermark(ctx, f.k, PREVIEW, state);

      cctx.drawImage(c, f.cell[0] * PREVIEW, f.cell[1] * PREVIEW);
      window.Viewer3D.updateFaceTexture(f.k, c);
    });
  }

  function setImage(src, w, h, name, size, opts = {}) {
    if (!opts.keepBanners) clearBanners();
    state.image = { source: src, width: w, height: h, name, size };
    try { GL.uploadTexture(src); } catch (e) { addBanner('error', e.message); return; }
    $('fileinfo').textContent = `${name} · ${w}×${h} px`;
    $('empty').hidden = true;
    $('btnZip').disabled = false;
    document.querySelectorAll('#facebtns button').forEach(b => b.disabled = false);
    requestRender();
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); setImage(img, img.naturalWidth, img.naturalHeight, file.name, file.size); };
    img.src = url;
  }

  // Sliders
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

  addSlider($('grpPos'), 'yaw', 'Yaw (horizontal)', 0, 360, 1, '°');
  addSlider($('grpPos'), 'pitch', 'Pitch (vertikal)', -45, 45, 1, '°');
  addSlider($('grpPos'), 'horizon', 'Horizon Level', -30, 30, 1, '°');

  addSlider($('grpColor'), 'brightness', 'Brightness', -100, 100, 1, '');
  addSlider($('grpColor'), 'contrast', 'Contrast', -100, 100, 1, '');
  addSlider($('grpColor'), 'saturation', 'Saturation', 0, 200, 1, '%');
  addSlider($('grpColor'), 'warmth', 'Warmth (Suhu)', -100, 100, 1, '');

  // Watermark handlers
  $('wmFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
      const img = new Image();
      img.onload = () => { state.watermarkImg = img; $('wmName').textContent = f.name; requestRender(); };
      img.src = URL.createObjectURL(f);
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
      b.addEventListener('click', () => { setFn(v); refresh(); });
      el.appendChild(b);
    });
    refresh();
    return refresh;
  }

  makeSeg($('segRes'), [512, 1024, 2048], v => v + ' px', () => state.exportRes, v => { state.exportRes = v; });
  const refUp = makeSeg($('segUp'), [0, 90, 180, 270], v => v + '°', () => state.rotUp, v => { state.rotUp = v; requestRender(); });
  const refDn = makeSeg($('segDn'), [0, 90, 180, 270], v => v + '°', () => state.rotDn, v => { state.rotDn = v; requestRender(); });
  $('flipH').addEventListener('change', e => { state.flipH = e.target.checked; requestRender(); });

  document.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.reset;
    if (g === 'pos') { setSlider('yaw', 0); setSlider('pitch', 0); setSlider('horizon', 0); }
    if (g === 'color') { setSlider('brightness', 0); setSlider('contrast', 0); setSlider('saturation', 100); setSlider('warmth', 0); }
    if (g === 'orient') { state.rotUp = 0; state.rotDn = 0; state.flipH = false; $('flipH').checked = false; refUp(); refDn(); }
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

  // Upload
  const drop = $('drop'), fileInput = $('file');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  $('btnTest').addEventListener('click', () => {
    const c = window.makeTestPanorama();
    setImage(c, c.width, c.height, 'Gambar Uji', null);
  });

  // Tabs
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
  $('tab-cross').onclick = () => switchTab('cross');
  $('tab-3d').onclick = () => switchTab('3d');
  $('tab-luau').onclick = () => switchTab('luau');

  $('chkBaseplate').addEventListener('change', e => window.Viewer3D.setBaseplate(e.target.checked));
  $('chkCharacter').addEventListener('change', e => window.Viewer3D.setCharacter(e.target.checked));
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

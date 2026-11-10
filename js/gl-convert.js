"use strict";
window.GLConvert = (function () {
  const PI = Math.PI;
  const FACES = [
    { k: 'Ft', name: 'Front', f: [0, 0, -1], u: [0, 1, 0], r: [1, 0, 0], cell: [1, 1] },
    { k: 'Bk', name: 'Back', f: [0, 0, 1], u: [0, 1, 0], r: [-1, 0, 0], cell: [3, 1] },
    { k: 'Lf', name: 'Left', f: [-1, 0, 0], u: [0, 1, 0], r: [0, 0, -1], cell: [0, 1] },
    { k: 'Rt', name: 'Right', f: [1, 0, 0], u: [0, 1, 0], r: [0, 0, 1], cell: [2, 1] },
    { k: 'Up', name: 'Up', f: [0, 1, 0], u: [0, 0, 1], r: [1, 0, 0], cell: [1, 0] },
    { k: 'Dn', name: 'Down', f: [0, -1, 0], u: [0, 0, -1], r: [1, 0, 0], cell: [1, 2] }
  ];

  // Konvensi sisi Roblox, diverifikasi langsung di Roblox Studio (v8): keenam arah dunia
  // dipasang marker (huruf asimetris + panah + titik), lalu dilihat dari dalam.
  // Hasil: Roblox mengisi arah -X lewat properti SkyboxRt dan arah +X lewat SkyboxLf
  // (kiri/kanan tertukar dibanding kubus internal aplikasi), SkyboxUp disimpan setara
  // putaran 90° CCW dan SkyboxDn setara putaran 90° CW dari render sisi aplikasi.
  // Ft dan Bk identik dengan kubus internal. Lihat README bagian "Orientasi sisi Roblox".
  const ROBLOX_PROPERTY = { Ft: 'Ft', Bk: 'Bk', Lf: 'Rt', Rt: 'Lf', Up: 'Up', Dn: 'Dn' };

  // Canvas render sisi aplikasi -> gambar siap pakai untuk properti Roblox terkait.
  // Up/Dn perlu diputar; sisi lain dipakai apa adanya.
  function rotatedForRoblox(faceKey, src) {
    if (faceKey !== 'Up' && faceKey !== 'Dn') return src;
    const s = src.width;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const g = c.getContext('2d');
    if (faceKey === 'Up') { g.translate(0, s); g.rotate(-Math.PI / 2); } // isi 90° CCW
    else { g.translate(s, 0); g.rotate(Math.PI / 2); }                  // isi 90° CW
    g.drawImage(src, 0, 0);
    return c;
  }

  const glCanvas = document.createElement('canvas');
  let gl = null, isGL2 = false, prog = null, loc = {}, tex = null, maxTex = 4096;

  const VS = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }';
  const FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uTex;',
    'uniform float uSize;',
    'uniform vec3 uFwd; uniform vec3 uRight; uniform vec3 uUp;',
    'uniform float uRot; uniform float uYaw; uniform float uPitch; uniform float uFlip;',
    'uniform float uBri; uniform float uCon; uniform float uSat;',
    'uniform float uHorizon; uniform float uWarmth;',
    'uniform float uFadeWidth; uniform vec3 uFadeColor; uniform float uSeam;',
    'uniform float uFadeTop; uniform vec3 uFadeTopColor;',
    'uniform float uMirror; uniform float uHue; uniform float uTint;',
    'uniform float uVOff;',
    'const float PI = 3.14159265359;',
    'vec3 shade(vec2 fc){',
    '  vec2 p = fc / uSize * 2.0 - 1.0;',
    '  float cr = cos(uRot); float sr = sin(uRot);',
    '  p = vec2(cr*p.x - sr*p.y, sr*p.x + cr*p.y);',
    '  vec3 d = normalize(uFwd + p.x*uRight + p.y*uUp);',
    '  float cp = cos(uPitch); float sp = sin(uPitch);',
    '  d = vec3(d.x, cp*d.y - sp*d.z, sp*d.y + cp*d.z);',
    '  float lon = atan(d.x, -d.z) + uYaw;',
    '  float lat0 = asin(clamp(d.y, -1.0, 1.0));',
    '  float lat = lat0 - uHorizon * cos(lat0);',
    '  float u = fract(lon / (2.0*PI) + 0.5);',
    '  if (uFlip > 0.5) u = 1.0 - u;',
    '  float v = 0.5 - lat / PI + uVOff;',
    '  if (uMirror > 0.5) v = 1.0 - v;',
    '  float vv = clamp(v, 0.0, 1.0);',
    '  vec3 c = texture2D(uTex, vec2(u, vv)).rgb;',
    '  if (uSeam > 0.0001) { float ds = min(u, 1.0 - u); float k = 0.5 * (1.0 - smoothstep(0.0, uSeam, ds)); c = mix(c, texture2D(uTex, vec2(1.0 - u, vv)).rgb, k); }',
    '  if (uFadeWidth > 0.001 && lat < 0.0) {',
    '    float t = clamp(-lat / uFadeWidth, 0.0, 1.0);',
    '    t = smoothstep(0.0, 1.0, t);',
    '    c = mix(c, uFadeColor, t);',
    '  }',
    '  if (uFadeTop > 0.001 && lat > 0.0) {',
    '    float tt = smoothstep(PI * 0.5 - uFadeTop, PI * 0.5, lat);',
    '    c = mix(c, uFadeTopColor, tt);',
    '  }',
    '  c += uBri;',
    '  c = (c - 0.5) * (1.0 + uCon) + 0.5;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(l), c, uSat);',
    '  c *= vec3(1.0 + uWarmth * 0.15, 1.0 + uWarmth * 0.03, 1.0 - uWarmth * 0.15);',
    '  float ang = uHue * ' + '3.14159265 / 180.0;',
    '  vec3 k1 = vec3(0.57735, 0.57735, 0.57735);',
    '  float ca = cos(ang);',
    '  c = c * ca + cross(k1, c) * sin(ang) + k1 * dot(k1, c) * (1.0 - ca);',
    '  c += vec3(uTint * 0.10, -uTint * 0.06, uTint * 0.10);',
    '  return clamp(c, 0.0, 1.0);',
    '}',
    'float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main(){',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec3 a = shade(fc + vec2(-0.25, -0.125)) + shade(fc + vec2(0.125, -0.25)) + shade(fc + vec2(0.25, 0.125)) + shade(fc + vec2(-0.125, 0.25));',
    '  vec3 a2 = shade(fc + vec2(0.375, -0.375)) + shade(fc + vec2(-0.375, 0.375)) + shade(fc + vec2(-0.375, -0.375)) + shade(fc + vec2(0.375, 0.375));',
    '  vec3 c = (a + a2) * 0.125;',
    '  c += (hash(fc) + hash(fc + 17.0) - 1.0) / 255.0;',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function setupGL() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    ['uTex', 'uSize', 'uFwd', 'uRight', 'uUp', 'uRot', 'uYaw', 'uPitch', 'uFlip', 'uBri', 'uCon', 'uSat', 'uHorizon', 'uWarmth', 'uFadeWidth', 'uFadeColor', 'uSeam', 'uFadeTop', 'uFadeTopColor', 'uMirror', 'uHue', 'uTint', 'uVOff']
      .forEach(n => loc[n] = gl.getUniformLocation(prog, n));
    maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
  }

  function initGL() {
    const opts = { preserveDrawingBuffer: true, antialias: false, alpha: false };
    gl = glCanvas.getContext('webgl2', opts);
    isGL2 = !!gl;
    if (!gl) gl = glCanvas.getContext('webgl', opts) || glCanvas.getContext('experimental-webgl', opts);
    if (!gl) return false;
    setupGL();

    glCanvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      if (window.MainApp && window.MainApp.onGLContextLost) {
        window.MainApp.onGLContextLost();
      }
    });

    glCanvas.addEventListener('webglcontextrestored', () => {
      try {
        setupGL();
        tex = null;
        if (window.MainApp && window.MainApp.onGLRestored) {
          window.MainApp.onGLRestored();
        }
      } catch (err) {
        if (window.MainApp && window.MainApp.addBanner) {
          window.MainApp.addBanner('error', 'Gagal memulihkan WebGL: ' + err.message);
        }
      }
    });

    return true;
  }

  function uploadTexture(imgSource) {
    if (tex) gl.deleteTexture(tex);
    tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgSource);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, isGL2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      throw new Error('Gagal mengunggah tekstur ke GPU (WebGL Error ' + err + ').');
    }
  }

  function setSize(n) {
    if (glCanvas.width !== n || glCanvas.height !== n) { glCanvas.width = n; glCanvas.height = n; }
    gl.viewport(0, 0, n, n);
  }

  function hexToRgb(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return [0.5, 0.5, 0.5];
    }
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return [0.5, 0.5, 0.5];
    return [r, g, b];
  }

  function drawFace(face, n, state) {
    const rot = face.k === 'Up' ? state.rotUp : face.k === 'Dn' ? state.rotDn : 0;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc.uTex, 0);
    gl.uniform1f(loc.uSize, n);
    gl.uniform3fv(loc.uFwd, face.f);
    gl.uniform3fv(loc.uRight, face.r);
    gl.uniform3fv(loc.uUp, face.u);
    gl.uniform1f(loc.uRot, rot * PI / 180);
    gl.uniform1f(loc.uYaw, state.yaw * PI / 180);
    gl.uniform1f(loc.uPitch, state.pitch * PI / 180);
    gl.uniform1f(loc.uFlip, state.flipH ? 1 : 0);
    gl.uniform1f(loc.uBri, state.brightness / 100);
    gl.uniform1f(loc.uCon, state.contrast / 100);
    gl.uniform1f(loc.uSat, state.saturation / 100);
    gl.uniform1f(loc.uHorizon, (state.horizon || 0) * PI / 180);
    gl.uniform1f(loc.uWarmth, (state.warmth || 0) / 100);
    gl.uniform1f(loc.uFadeWidth, ((state.fadeHorizon || 0) * PI / 180));
    gl.uniform3fv(loc.uFadeColor, hexToRgb(state.fadeColor));
    gl.uniform1f(loc.uFadeTop, (state.fadeTop || 0) * PI / 180);
    gl.uniform3fv(loc.uFadeTopColor, hexToRgb(state.fadeTopColor));
    gl.uniform1f(loc.uSeam, (state.seamBlend || 0) / 100);
    // "Cermin langit": sisi bawah mencerminkan langit atas — cocok untuk map melayang.
    gl.uniform1f(loc.uMirror, (face.k === 'Dn' && state.mirrorDn) ? 1 : 0);
    gl.uniform1f(loc.uHue, state.hue || 0);
    gl.uniform1f(loc.uTint, (state.tint || 0) / 100);
    gl.uniform1f(loc.uVOff, (state.vOff || 0) / 180);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Titik jangkar posisi watermark dalam pecahan ukuran sisi (x, y).
  const WM_ANCHORS = {
    'tengah': [0.5, 0.5],
    'kiri-atas': [0.16, 0.16],
    'kanan-atas': [0.84, 0.16],
    'kiri-bawah': [0.16, 0.84],
    'kanan-bawah': [0.84, 0.84]
  };

  function applyWatermark(cctx, faceKey, size, state) {
    const wm = state.watermarkImg;
    if (!wm) return;
    // state.wmSides: array kunci sisi ('ft','bk','lf','rt','up','dn'). String tunggal
    // dari perilaku lama ('dn') tetap diterima demi kompatibilitas.
    let sides = state.wmSides;
    if (typeof sides === 'string') sides = [sides];
    if (!Array.isArray(sides) || !sides.length) sides = ['dn'];
    if (!sides.includes(faceKey.toLowerCase())) return;

    const scale = (state.watermarkScale || 25) / 100;
    const opacity = (state.watermarkOpacity || 50) / 100;
    const wmSize = size * scale;
    const anchor = WM_ANCHORS[state.wmAnchor] || WM_ANCHORS['tengah'];
    const dx = ((state.wmDx || 0) / 100) * size;
    const dy = ((state.wmDy || 0) / 100) * size;
    const rot = ((state.wmRot || 0) * Math.PI) / 180;
    cctx.save();
    cctx.globalAlpha = opacity;
    cctx.translate(anchor[0] * size + dx, anchor[1] * size + dy);
    if (rot) cctx.rotate(rot);
    cctx.drawImage(wm, -wmSize / 2, -wmSize / 2, wmSize, wmSize);
    cctx.restore();
  }

  return {
    FACES, ROBLOX_PROPERTY, rotatedForRoblox, glCanvas, initGL, uploadTexture, setSize, drawFace, applyWatermark, hexToRgb,
    getMaxTex: () => maxTex,
    toBlob: () => new Promise((res, rej) => glCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob menghasilkan null')), 'image/png'))
  };
})();
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
    'const float PI = 3.14159265359;',
    'void main(){',
    '  vec2 p = gl_FragCoord.xy / uSize * 2.0 - 1.0;',
    '  float cr = cos(uRot); float sr = sin(uRot);',
    '  p = vec2(cr*p.x - sr*p.y, sr*p.x + cr*p.y);',
    '  vec3 d = normalize(uFwd + p.x*uRight + p.y*uUp);',
    '  float cp = cos(uPitch); float sp = sin(uPitch);',
    '  d = vec3(d.x, cp*d.y - sp*d.z, sp*d.y + cp*d.z);',
    '  float lon = atan(d.x, -d.z) + uYaw;',
    '  float lat = asin(clamp(d.y, -1.0, 1.0));',
    '  float u = fract(lon / (2.0*PI) + 0.5);',
    '  if (uFlip > 0.5) u = 1.0 - u;',
    '  float v = 0.5 - lat / PI;',
    '  vec3 c = texture2D(uTex, vec2(u, v)).rgb;',
    '  c += uBri;',
    '  c = (c - 0.5) * (1.0 + uCon) + 0.5;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(l), c, uSat);',
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
    ['uTex', 'uSize', 'uFwd', 'uRight', 'uUp', 'uRot', 'uYaw', 'uPitch', 'uFlip', 'uBri', 'uCon', 'uSat']
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
  }

  function setSize(n) {
    if (glCanvas.width !== n || glCanvas.height !== n) { glCanvas.width = n; glCanvas.height = n; }
    gl.viewport(0, 0, n, n);
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    FACES, glCanvas, initGL, uploadTexture, setSize, drawFace,
    getMaxTex: () => maxTex,
    toBlob: () => new Promise((res, rej) => glCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob gagal')), 'image/png'))
  };
})();

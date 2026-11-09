// Verifikasi geometris fix orientasi skybox (v8).
//
// Pipa yang diuji (mengikuti kode aplikasi):
//   render sisi app (basis FACES + shader equirect) -> canvas rotasi rotatedForRoblox
//   -> properti Roblox (ROBLOX_PROPERTY) -> dibaca Roblox menurut konvensi empiris Studio.
//
// Klaim yang diverifikasi: untuk SEMUA arah d di bola langit, warna yang dilihat Roblox
// (via properti + koordinat gambar konvensi Roblox) sama dengan sampel panorama langsung
// dari arah d. Kalau tanda rotasi atau swap Lf/Rt salah, uji ini gagal di seam/kutub.
//
// Konvensi Roblox hasil eksperimen marker di Studio (screenshots mk_ft..mk_dn):
//   -Z: SkyboxFt, image-top=+Y, image-right=+X   (tegak, tak termirror)
//   +Z: SkyboxBk, image-top=+Y, image-right=-X
//   -X: SkyboxRt, image-top=+Y, image-right=-Z
//   +X: SkyboxLf, image-top=+Y, image-right=+Z
//   +Y: SkyboxUp, image-top=+X, image-right=-Z   (isi = render app sisi Up diputar 90° CCW)
//   -Y: SkyboxDn, image-top=-X, image-right=-Z   (isi = render app sisi Dn diputar 90° CW)

const PI = Math.PI;
const V = (x, y, z) => [x, y, z];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

// Sisi kubus internal aplikasi (identik dengan FACES di gl-convert.js).
const APP_FACES = {
  Ft: { n: V(0, 0, -1), u: V(0, 1, 0), r: V(1, 0, 0) },
  Bk: { n: V(0, 0, 1), u: V(0, 1, 0), r: V(-1, 0, 0) },
  Lf: { n: V(-1, 0, 0), u: V(0, 1, 0), r: V(0, 0, -1) },
  Rt: { n: V(1, 0, 0), u: V(0, 1, 0), r: V(0, 0, 1) },
  Up: { n: V(0, 1, 0), u: V(0, 0, 1), r: V(1, 0, 0) },
  Dn: { n: V(0, -1, 0), u: V(0, 0, -1), r: V(1, 0, 0) }
};
const ROBLOX_PROPERTY = { Ft: 'Ft', Bk: 'Bk', Lf: 'Rt', Rt: 'Lf', Up: 'Up', Dn: 'Dn' };

// Konvensi empiris Roblox: properti -> sumbu gambar (top, right) dalam arah dunia.
const ROBLOX_AXES = {
  Ft: { top: V(0, 1, 0), right: V(1, 0, 0) },
  Bk: { top: V(0, 1, 0), right: V(-1, 0, 0) },
  Lf: { top: V(0, 1, 0), right: V(0, 0, 1) },
  Rt: { top: V(0, 1, 0), right: V(0, 0, -1) },
  Up: { top: V(1, 0, 0), right: V(0, 0, -1) },
  Dn: { top: V(-1, 0, 0), right: V(0, 0, -1) }
};
// Normal arah dunia yang diisi tiap properti (dari eksperimen).
const ROBLOX_NORMAL = { Ft: V(0, 0, -1), Bk: V(0, 0, 1), Lf: V(1, 0, 0), Rt: V(-1, 0, 0), Up: V(0, 1, 0), Dn: V(0, -1, 0) };

// Sampling shader aplikasi: pixel (px, py) di [-1,1] pada sisi f -> koordinat panorama (u, v).
function appSample(faceKey, px, py) {
  const f = APP_FACES[faceKey];
  const d = norm([f.n[0] + px * f.r[0] + py * f.u[0], f.n[1] + px * f.r[1] + py * f.u[1], f.n[2] + px * f.r[2] + py * f.u[2]]);
  return d;
}
function dToPano(d) {
  const lon = Math.atan2(d[0], -d[2]);          // atan(d.x, -d.z), rentang (-PI, PI]
  const lat = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const u = lon / (2 * PI) + 0.5;
  const v = 0.5 - lat / PI;
  return { u, v, lon, lat };
}

// Pemilihan sisi Roblox untuk arah d + koordinat gambar properti (ix: 0 kiri -> 1 kanan, iy: 0 bawah -> 1 atas).
function robloxLookup(d) {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  let prop;
  if (ay >= ax && ay >= az) prop = d[1] > 0 ? 'Up' : 'Dn';
  else if (ax >= az) prop = d[0] > 0 ? 'Lf' : 'Rt';
  else prop = d[2] < 0 ? 'Ft' : 'Bk';
  const A = ROBLOX_AXES[prop], n = ROBLOX_NORMAL[prop];
  const fd = dot(d, n);
  const cx = dot(d, A.right) / fd;   // -1..1 (kanan gambar)
  const cy = dot(d, A.top) / fd;     // -1..1 (atas gambar)
  return { prop, cx, cy };
}

// Kembalikan koordinat sisi aplikasi yang kontennya muncul di (prop, cx, cy),
// dengan memodelkan rotasi canvas rotatedForRoblox (Up: CCW, Dn: CW) dan swap Lf/Rt.
function appSourceOf(prop, cx, cy) {
  const appKey = Object.keys(ROBLOX_PROPERTY).find(k => ROBLOX_PROPERTY[k] === prop);
  let sx = cx, sy = cy;
  if (prop === 'Up') {        // konten baru = lama diputar CCW90: (cx,cy) -> (-cy,cx); balikan: CW90
    sx = cy; sy = -cx;
  } else if (prop === 'Dn') { // konten baru = lama diputar CW90: (cx,cy) -> (cy,-cx); balikan: CCW90
    sx = -cy; sy = cx;
  }
  return { appKey, px: sx, py: sy };
}

let tested = 0, failures = 0;
const failDetail = [];
function check(d, tag) {
  const { prop, cx, cy } = robloxLookup(d);
  // lewati titik tepat di tepi antar-sisi (ambigu), uji yang jelas
  if (Math.abs(Math.abs(cx) - 1) < 1e-9 || Math.abs(Math.abs(cy) - 1) < 1e-9) return;
  const { appKey, px, py } = appSourceOf(prop, cx, cy);
  const dViaApp = appSample(appKey, px, py);
  const p1 = dToPano(d), p2 = dToPano(dViaApp);
  let dLon = Math.abs(p1.lon - p2.lon);
  if (dLon > PI) dLon = 2 * PI - dLon;              // wrap 360°
  const dLat = Math.abs(p1.lat - p2.lat);
  const tol = 1e-6;
  tested++;
  if (dLon > tol || dLat > tol) {
    failures++;
    if (failDetail.length < 8) failDetail.push({ tag, d: d.map(x => x.toFixed(3)).join(','), prop, appKey, dLon: dLon.toFixed(7), dLat: dLat.toFixed(7) });
  }
}

// 1) Grid reguler di bola (batimas: yaw/pitch/horizon = 0, flip = false)
const N = 240;
for (let i = 0; i < N; i++) {
  const lat = -PI / 2 + (i + 0.5) * PI / N;
  for (let j = 0; j < N; j++) {
    const lon = -PI + (j + 0.5) * 2 * PI / N;
    const cl = Math.cos(lat);
    check(norm([cl * Math.sin(lon), Math.sin(lat), -cl * Math.cos(lon)]), 'grid');
  }
}

// 2) Tepi-tepi kubus (12 rusuk) + sekitar kutub — titik rawan seam
const EDGE = 0.998, E = 33;
for (let t = 0; t < E; t++) {
  const s = -1 + 2 * t / (E - 1);
  for (const [a, b] of [[s, EDGE, 0], [s, -EDGE, 0], [EDGE, s, 0], [-EDGE, s, 0]]) {} // placeholder
}
const edgePts = [];
for (let t = 0; t < E; t++) {
  const s = -1 + 2 * t / (E - 1);
  edgePts.push([s, EDGE, EDGE], [s, -EDGE, EDGE], [s, EDGE, -EDGE], [s, -EDGE, -EDGE]);
  edgePts.push([EDGE, s, EDGE], [EDGE, s, -EDGE], [-EDGE, s, EDGE], [-EDGE, s, -EDGE]);
  edgePts.push([EDGE, EDGE, s], [EDGE, -EDGE, s], [-EDGE, EDGE, s], [-EDGE, -EDGE, s]);
  edgePts.push([0.02, 1, 0.02], [0.02, -1, 0.02], [1, 0.02, 0.02], [-1, 0.02, 0.02]); // dekat kutub
}
edgePts.forEach(p => check(norm(p), 'edge/pole'));

console.log(`Diujikan: ${tested} arah`);
if (failures === 0) {
  console.log('SEMUA COCOK: pipeline render->rotasi->properti Roblox kontinu global & identik dengan panorama.');
  process.exit(0);
} else {
  console.log(`GAGAL: ${failures} arah tidak cocok. Contoh:`);
  failDetail.forEach(x => console.log(' ', JSON.stringify(x)));
  process.exit(1);
}

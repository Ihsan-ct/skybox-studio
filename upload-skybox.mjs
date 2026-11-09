#!/usr/bin/env node
/**
 * Roblox Skybox Uploader (pendamping Roblox Skybox Studio)
 *
 * Mengunggah 6 sisi skybox ke Roblox lewat Open Cloud Assets API, lalu mencetak
 * ID tiap sisi dan menulis script Luau siap pakai. Berjalan di komputermu sendiri:
 * API key tidak pernah masuk ke halaman web.
 *
 * Syarat: Node.js 18 atau lebih baru. Tanpa dependency.
 *
 * Pemakaian:
 *   export ROBLOX_API_KEY="kunci_open_cloud_kamu"
 *   node upload-skybox.mjs RobloxSkybox_1024.zip --user-id 123456789
 *   node upload-skybox.mjs ./folder_png --group-id 987654 --name LangitSenja
 *   node upload-skybox.mjs RobloxSkybox_1024.zip --dry-run        (tanpa jaringan)
 *
 * Opsi:
 *   --user-id <id>     pemilik aset (atau env ROBLOX_USER_ID)
 *   --group-id <id>    pemilik grup (atau env ROBLOX_GROUP_ID)
 *   --name <nama>      awalan nama aset (default: Skybox)
 *   --type <Image|Decal>  paksa assetType (default: coba Image, lalu Decal)
 *   --dry-run          hanya periksa file, tidak mengunggah
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const FACES = ['Ft', 'Bk', 'Lf', 'Rt', 'Up', 'Dn'];
const API = 'https://apis.roblox.com/assets/v1';
const MAX_BYTES = 20 * 1024 * 1024;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function die(msg){ console.error('Galat: ' + msg); process.exit(1); }

function parseArgs(argv){
  const o = {_: []};
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

// ---- Pembaca ZIP minimal (STORE dan DEFLATE) ----
function readZip(buf){
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--){
    if (buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP tidak valid (EOCD tidak ditemukan)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++){
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP rusak (central directory)');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + ln + le;
    const raw = buf.subarray(start, start + csize);
    if (method === 0) out[name] = Buffer.from(raw);
    else if (method === 8) out[name] = zlib.inflateRawSync(raw);
    else throw new Error('Metode kompresi ZIP tidak didukung: ' + method);
  }
  return out;
}

function collect(input){
  const files = {}; // nama berkas -> Buffer
  const st = fs.statSync(input);
  if (st.isDirectory()){
    for (const f of fs.readdirSync(input)) {
      const full = path.join(input, f);
      if (fs.statSync(full).isFile()) files[f] = fs.readFileSync(full);
    }
  } else if (/\.zip$/i.test(input)){
    const z = readZip(fs.readFileSync(input));
    for (const k of Object.keys(z)) files[path.basename(k)] = z[k];
  } else die('Masukan harus berupa .zip atau folder berisi PNG.');

  const faces = {};
  for (const [name, buf] of Object.entries(files)){
    const m = /^skybox(ft|bk|lf|rt|up|dn)\.png$/i.exec(name);
    if (m){
      const k = m[1][0].toUpperCase() + m[1][1];
      faces[k] = buf;
    }
  }
  const missing = FACES.filter(k => !faces[k]);
  if (missing.length) die('Sisi tidak ditemukan: ' + missing.map(k => 'Skybox' + k + '.png').join(', '));
  for (const k of FACES){
    const b = faces[k];
    if (b.length < 8 || b.readUInt32BE(0) !== 0x89504e47) die('Skybox' + k + '.png bukan PNG yang valid.');
    if (b.length > MAX_BYTES) die('Skybox' + k + '.png lebih dari 20 MB (batas satu unggahan).');
  }
  return faces;
}

// ---- Open Cloud ----
async function createAsset(key, type, displayName, creator, buf){
  const form = new FormData();
  form.append('request', JSON.stringify({
    assetType: type,
    displayName,
    description: 'Skybox face, diunggah dengan Roblox Skybox Studio',
    creationContext: {creator}
  }));
  form.append('fileContent', new Blob([buf], {type: 'image/png'}), displayName + '.png');
  for (let attempt = 0; attempt < 4; attempt++){
    const res = await fetch(API + '/assets', {method: 'POST', headers: {'x-api-key': key}, body: form});
    const text = await res.text();
    if (res.status === 429){ await sleep(3000 * (attempt + 1)); continue; }
    if (!res.ok){
      const e = new Error('HTTP ' + res.status + ': ' + text.slice(0, 400));
      e.status = res.status; throw e;
    }
    return JSON.parse(text);
  }
  throw new Error('Terkena rate limit berulang kali (HTTP 429). Coba lagi nanti.');
}
async function waitOperation(key, opPath){
  for (let i = 0; i < 40; i++){
    await sleep(i === 0 ? 1000 : 2000);
    const res = await fetch(API + '/' + opPath, {headers: {'x-api-key': key}});
    const text = await res.text();
    if (!res.ok) throw new Error('Polling gagal, HTTP ' + res.status + ': ' + text.slice(0, 300));
    const j = JSON.parse(text);
    if (j.done){
      if (j.error) throw new Error('Unggahan ditolak: ' + JSON.stringify(j.error));
      if (j.response && j.response.assetId) return String(j.response.assetId);
      throw new Error('Operasi selesai tanpa assetId: ' + text.slice(0, 300));
    }
  }
  throw new Error('Waktu tunggu habis (mungkin masih dalam moderasi).');
}

function luau(ids){
  return [
    'local Lighting = game:GetService("Lighting")',
    'local sky = Lighting:FindFirstChildOfClass("Sky") or Instance.new("Sky")',
    'sky.Name = "Sky"',
    ...FACES.map(k => 'sky.Skybox' + k + ' = "rbxassetid://' + ids[k] + '"'),
    'sky.CelestialBodiesShown = false',
    'sky.Parent = Lighting',
    ''
  ].join('\n');
}

// ---- Main ----
const o = parseArgs(process.argv.slice(2));
if (o.help || !o._[0]){
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*\*\n?|^ \* ?/gm, ''));
  process.exit(o.help ? 0 : 1);
}
const faces = collect(o._[0]);
const userId = o['user-id'] || process.env.ROBLOX_USER_ID;
const groupId = o['group-id'] || process.env.ROBLOX_GROUP_ID;
if (!userId && !groupId) die('Isi --user-id atau --group-id (atau env ROBLOX_USER_ID / ROBLOX_GROUP_ID).');
if (userId && !/^\d+$/.test(userId)) die('--user-id harus berupa angka.');
if (groupId && !/^\d+$/.test(groupId)) die('--group-id harus berupa angka.');
const creator = groupId ? {groupId: String(groupId)} : {userId: String(userId)};
const base = (o.name || 'Skybox').replace(/[^\w\- ]/g, '').slice(0, 40) || 'Skybox';

console.log('Berkas ditemukan:');
FACES.forEach(k => console.log('  Skybox' + k + '.png  ' + (faces[k].length / 1024).toFixed(0) + ' KB'));
if (o.dry){ console.log('\n--dry-run: semua berkas valid. Tidak ada yang diunggah.'); process.exit(0); }

const key = process.env.ROBLOX_API_KEY;
if (!key) die('Set env ROBLOX_API_KEY terlebih dahulu (jangan tempel kunci di baris perintah).');

let type = o.type || 'Image';
const ids = {};
try {
  for (const k of FACES){
    const name = base + '_' + k;
    process.stdout.write('Mengunggah ' + name + ' (' + type + ')… ');
    let op;
    try { op = await createAsset(key, type, name, creator, faces[k]); }
    catch (e){
      if (e.status === 400 && !o.type && type === 'Image' && Object.keys(ids).length === 0){
        type = 'Decal';
        console.log('\n  assetType Image ditolak; mencoba Decal.');
        op = await createAsset(key, type, name, creator, faces[k]);
      } else throw e;
    }
    ids[k] = await waitOperation(key, op.path);
    console.log('ID ' + ids[k]);
    await sleep(500);
  }
} catch (e){
  console.error('\nGagal: ' + e.message);
  if (Object.keys(ids).length) console.error('Sisi yang sudah terunggah: ' + JSON.stringify(ids));
  process.exit(1);
}

fs.writeFileSync('skybox-result.json', JSON.stringify({assetType: type, ids}, null, 2));
fs.writeFileSync('skybox-sky.lua', luau(ids));
console.log('\nSelesai. Ditulis: skybox-result.json dan skybox-sky.lua');
if (type === 'Decal'){
  console.log('\nPERHATIAN: aset diunggah sebagai Decal. ID ini adalah Decal ID. Jika skybox tampil putih,');
  console.log('buka Asset Manager di Studio, cari tiap gambar, dan pakai Image ID-nya di Sky.');
}
console.log('\n' + luau(ids));

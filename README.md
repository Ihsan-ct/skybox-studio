# Roblox Skybox Studio

Aplikasi web 100% client-side (WebGL + Three.js) tanpa framework dan tanpa build step. Mengubah panorama 360 ekuirektangular (rasio 2:1) menjadi 6 sisi skybox Roblox (SkyboxFt, SkyboxBk, SkyboxLf, SkyboxRt, SkyboxUp, SkyboxDn) tanpa celah sambungan (zero seam).

## Fitur Utama
1. Konversi WebGL shader GLSL ES 1.00 (PRD 5.2) murni di GPU lokal.
2. Preview Cross Net 2D interaktif pada 60 FPS (256 px).
3. Preview 3D Three.js dengan Roblox Baseplate, dummy character 3D, FOV zoom (40-100), dan drag camera berinersia.
4. Wireframe Seam mode (EdgesGeometry) tanpa glitch garis diagonal.
5. Fade Horizon smoothstep dan watermark logo sisi Dn dengan kontrol skala dan opasitas.
6. Generator script Luau untuk ServerScriptService dengan Image ID numerik (muncul otomatis di tab Upload Roblox setelah upload selesai).
7. Ekspor individual PNG dan berkas ZIP (512, 1024, 2048 px).
8. Stitcher: gabungkan 6 sisi skybox kembali menjadi satu panorama untuk diedit ulang.

## Struktur Proyek
```
skybox-studio/
├── index.html            # Dashboard utama (akun, ringkasan, riwayat)
├── studio.html           # Skybox Studio (konversi + upload)
├── css/
│   └── app.css
├── js/
│   ├── gl-convert.js     # shader WebGL (equirectangular -> cube face)
│   ├── testpattern.js    # generator panorama uji
│   ├── viewer3d.js       # preview 3D Three.js
│   ├── zip-export.js     # ekspor PNG / ZIP
│   ├── luau.js           # generator script Luau + file Sky .rbxmx
│   ├── auth.js           # status login + tombol masuk
│   ├── vault.js          # brankas akun (localStorage, enkripsi opsional) + riwayat upload
│   ├── dashboard.js      # logika halaman Dashboard
│   ├── stitcher.js       # gabungkan 6 sisi -> panorama
│   ├── roblox-upload.js  # UI + orkestrasi upload langsung ke Roblox
│   └── main.js           # wiring UI + state aplikasi
├── api/
│   ├── roblox-create.js  # Serverless Function: proxy buat asset (hindari CORS)
│   ├── roblox-poll.js    # Serverless Function: proxy cek status operation
│   ├── _guard.js         # tolak request lintas-situs + Cache-Control: no-store
│   ├── _session.js       # cookie sesi bertanda tangan HMAC (7 hari)
│   ├── _db.js            # klien Upstash Redis (REST)
│   ├── sync.js           # sinkron profil + riwayat (tanpa API key)
│   └── auth/[action].js  # login/callback/me/logout (Google, Discord)
├── upload-skybox.mjs     # CLI upload ke Roblox Open Cloud (alternatif tanpa backend)
├── test-api.mjs          # cek proxy tanpa jaringan (npm test)
├── vercel.json
├── package.json
└── LICENSE
```

## Menjalankan Secara Lokal
Karena ini static site tanpa build step, cukup serve foldernya — jangan buka `index.html` langsung lewat `file://` karena beberapa browser memblokir fetch/texture lokal karena CORS.

```bash
npx serve .
# atau
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080` (atau port yang ditampilkan).

## Deployment Vercel & GitHub Pages
- Keamanan: `vercel.json` memasang CSP (skrip hanya dari situs sendiri dan cdnjs), HSTS, dan Permissions-Policy. Kalau menambah skrip atau CDN baru, perbarui `script-src`.
- Vercel: Framework Preset "Other", Output Directory ".", `vercel.json` sudah set `cleanUrls`, `framework: null`, `maxDuration` function, dan header keamanan dasar.
- GitHub Pages: Deploy dari branch `main`, folder root (hanya konversi/ekspor; upload langsung tidak tersedia).

## Upload Langsung ke Roblox (dari browser)
**Langkah singkat**
1. Buat API Key di [Creator Dashboard > Credentials](https://create.roblox.com/dashboard/credentials) dengan permission **Assets** (Read + Write); biarkan pembatasan IP mati karena IP Vercel berubah-ubah.
2. Buka situs yang di-deploy di Vercel, unggah panorama, lalu buka tab **Upload Roblox**.
3. Isi API Key dan User ID (atau Group ID), klik **Upload ke Roblox**. Tiap sisi dirender, diunggah, dan Image ID langsung terisi. Begitu ke-6 sisi selesai, **script Luau muncul otomatis di bawah panel upload** (tidak ada tab terpisah), tinggal klik **Salin script**. Kalau ada sisi yang gagal, tombol **Coba lagi** muncul di sisi itu saja (sisi lain tidak diunggah ulang); tombol **Lihat di Preview 3D** membuka pratinjau hasilnya. Atau klik **Unduh file Sky (.rbxmx)**, lalu di Roblox Studio klik kanan `Lighting` > *Insert From File* (tanpa script). Nama aset memakai nama file gambar sebagai awalan (mis. `langit-malam_Ft`), bisa diubah. Kalau aset terunggah sebagai Decal, muncul kotak peringatan beserta cara mengambil Image ID yang benar. Kalau kamu mengunggah sendiri lewat Roblox Studio, isi Image ID di bagian "Sudah punya Image ID? Isi manual".

Ini jalan lewat 2 Serverless Function (`api/roblox-create.js`, `api/roblox-poll.js`) karena Roblox Open Cloud tidak mengizinkan request langsung dari browser (CORS). Browser memanggil `/api/*` (same-origin), lalu function meneruskannya server-to-server ke Roblox. API key hanya diteruskan per request, tidak disimpan. Request lintas-situs ditolak (`api/_guard.js`).

**Akun tersimpan.** Kelola akun di halaman **Dashboard** (`index.html`), atau simpan langsung dari tab Upload Roblox, supaya tidak mengetik ulang. Data disimpan di `localStorage` browser itu saja (tidak dikirim ke server). Setelah upload pertama berhasil, API key **diingat otomatis** (kotak "Ingat API key" aktif secara default) dan terisi sendiri di kunjungan berikutnya, jadi tidak perlu dimasukkan lagi. Key dienkripsi AES-GCM dengan kunci perangkat yang tidak bisa diekspor (disimpan di IndexedDB). Kalau kamu mengisi kata sandi, key memakai kunci dari kata sandi (PBKDF2) dan kata sandi diminta lagi saat menekan **Pakai**. Teks biasa hanya dipakai kalau browser tidak mendukung enkripsi dan kamu menyetujuinya. Jangan simpan key di komputer bersama.

**Batas 4,5 MB.** Vercel membatasi body request function sampai 4,5 MB. Kalau PNG satu sisi lebih besar dari ±4,2 MB, aplikasi otomatis memperkecil resolusinya bertahap (minimum 512 px) dan mencatatnya di log. Kalau tetap tidak muat, pakai `upload-skybox.mjs`.

**Kalau gagal di tengah jalan.** Sisi yang sudah berhasil tetap tersimpan dan ID-nya sudah terisi. Tekan **Upload ke Roblox** lagi untuk melanjutkan (operasi yang masih diproses/moderasi dicek ulang, bukan diunggah ulang). **Mulai dari awal** mengunggah semua sisi dari nol, misalnya setelah mengganti panorama.

**Keterbatasan:** butuh backend (Vercel atau hosting lain yang mendukung Node serverless functions). **Tidak jalan di GitHub Pages**; di sana pakai skrip terminal di bawah.

## Login (Google & Discord) dan Database
Upload langsung ke Roblox **wajib login**. Konversi, preview, dan ekspor ZIP tetap bebas tanpa login. Semua akun Google/Discord boleh masuk; sesi berlaku 7 hari.

**Cara kerja.** OAuth 2.0 Authorization Code + PKCE lewat `api/auth/[action].js` (`login`, `callback`, `me`, `logout`). Sesi disimpan di cookie `HttpOnly; Secure; SameSite=Lax` bertanda tangan HMAC (tanpa tabel sesi), berisi id/nama/avatar saja. `roblox-create` dan `roblox-poll` menolak request tanpa sesi (401).

**Database (Upstash Redis via REST, tanpa library).** `api/sync.js` menyimpan profil akun (nama, tipe, ID, awalan) dan riwayat upload per pengguna supaya sinkron antar perangkat. **API key Roblox tidak pernah dikirim atau disimpan di server/database**; di perangkat baru, tempel key sekali lagi. Data lokal browser dipisah per pengguna yang login.

**Setup (sekali).**
1. Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web). Authorized redirect URI: `https://DOMAIN-KAMU/api/auth/callback`.
2. Discord Developer Portal > New Application > OAuth2. Tambahkan redirect yang sama; scope yang dipakai `identify`.
3. Buat database Upstash Redis (Vercel Marketplace > Upstash).
4. Isi Environment Variables di Vercel lalu redeploy:

| Variabel | Isi |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | dari Google Cloud |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | dari Discord |
| `SESSION_SECRET` | string acak panjang (min. 16, disarankan 32+ karakter) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | dari Upstash (nama `KV_REST_API_URL` / `KV_REST_API_TOKEN` dari integrasi Vercel juga dikenali; biasanya terisi otomatis) |
| `SITE_URL` (opsional) | mis. `https://skybox-studio-s977.vercel.app`, bila redirect URI tidak cocok |

Tanpa variabel Upstash, login dan upload tetap jalan; hanya sinkronisasi yang nonaktif.

## Skrip upload-skybox.mjs (alternatif via terminal)
Gunakan kredensial `ROBLOX_API_KEY` untuk unggah 6 sisi langsung ke Open Cloud Assets API dari command line — cocok untuk otomasi/CI, atau kalau kamu deploy situsnya di hosting statis murni (GitHub Pages) yang tidak punya backend.

```bash
export ROBLOX_API_KEY="kunci_open_cloud_kamu"
node upload-skybox.mjs RobloxSkybox_1024.zip --user-id ID_ANDA
```

Catatan: Jika skybox tampil putih di game, salin Image ID dari Asset Manager di Roblox Studio (bukan Decal ID).

## Dependensi & Hash SRI
- Three.js r128 (cdnjs): `sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==`
- JSZip 3.10.1 (cdnjs): `sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==`

Kalau kamu meng-upgrade versi library ini, pastikan hash SRI di `studio.html` diperbarui juga (ambil dari [cdnjs.com](https://cdnjs.com)), kalau tidak browser akan memblokir script-nya tanpa error yang terlihat oleh user.

## Batasan & Moderasi Roblox
- Resolusi input otomatis disesuaikan dengan batas `MAX_TEXTURE_SIZE` GPU peramban.
- Gambar tunduk pada Roblox Community Standards; hindari konten berhak cipta terlarang.

## Orientasi sisi Roblox (penting, diperbaiki di v1.1.0)

Konvensi sisi `Sky` milik Roblox **berbeda dari kubus standar**: arah kiri/kanan dunia
diisi lewat properti yang tertukar, dan sisi atas/bawah tersimpan dengan rotasi. Ini
diverifikasi langsung di Roblox Studio dengan memasang enam tekstur berpenanda (huruf
asimetris + panah + titik) lalu dilihat dari dalam untuk tiap arah:

| Arah dunia | Properti Roblox | Orientasi gambar (image-top / image-right) |
|---|---|---|
| Depan (−Z) | `SkyboxFt` | +Y / +X — sama dengan kubus internal |
| Belakang (+Z) | `SkyboxBk` | +Y / −X — sama |
| Kiri (−X) | **`SkyboxRt`** | +Y / −Z — nama properti tertukar, gambar tegak |
| Kanan (+X) | **`SkyboxLf`** | +Y / +Z — nama properti tertukar, gambar tegak |
| Atas (+Y) | `SkyboxUp` | +X / −Z — setara render sisi Up **diputar 90° CCW** |
| Bawah (−Y) | `SkyboxDn` | −X / −Z — setara render sisi Dn **diputar 90° CW** |

Karena itu, sejak v1.1.0 semua jalur keluaran aplikasi sudah mengikuti konvensi Roblox:

- **Upload langsung**: gambar sisi kiri diunggah sebagai aset `SkyboxRt`, sisi kanan
  sebagai `SkyboxLf`; sisi Up/Down diputar otomatis sebelum diunggah. Nama aset
  (`<awalan>_Rt`, dst.) mengikuti nama properti, jadi ID tinggal ditempel ke properti
  `Sky` dengan nama yang sama.
- **Ekspor ZIP / file per sisi**: nama file = nama properti (`SkyboxRt.png` berisi
  render sisi kiri), dengan Up/Down sudah diputar — siap diunggah manual via Asset
  Manager atau `upload-skybox.mjs` tanpa penyesuaian lagi.
- **Script Luau & .rbxmx**: menerima ID per nama properti.
- **Stitcher**: mengenali file bernama properti Roblox (menukar Lf/Rt kembali ke slot
  arah yang benar) dan default rotasi Up=270°/Down=90° untuk membongkar putaran ekspor.

Preview 3D dan panel Preview Cross tetap memakai kubus internal yang benar secara
geometri, jadi apa yang terlihat di preview = apa yang terlihat di Roblox. Kontinuitas
global mapping ini diuji otomatis (`tests/verify-convention.mjs`, 57.756 arah sampel
termasuk semua rusuk kubus dan kutub).

## Kontribusi
Issue dan PR dipersilakan. Proyek ini sengaja dibuat tanpa dependency/build step, jadi perubahan langsung ke file `js/*.js` yang relevan.

## Lisensi
MIT — lihat [LICENSE](LICENSE).


## Gambar 2D biasa → skybox (otomatis)

Pengguna cukup mengunggah gambar biasa (foto, render, atau hasil AI berbentuk persegi panjang).
Jika rasionya bukan 2:1, Studio otomatis mengubahnya menjadi panorama 360° (`js/flat2pano.js`):
gambar ditempatkan di depan kamera dengan proyeksi perspektif (objek tidak melar), sisanya diisi
dari warna gambar dan menyambung di sekeliling 360°. Pengaturan di panel "Gambar 2D → Panorama":
jenis isi (Pemandangan / Langit), lebar sudut pandang, geser naik/turun, dan pelembutan tepi.
Gambar 2:1 dianggap panorama equirectangular, dan bisa diganti manual lewat tombol "Gambar 2D biasa".

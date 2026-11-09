# Roblox Skybox Studio

Aplikasi web 100% client-side (WebGL + Three.js) tanpa framework dan tanpa build step. Mengubah panorama 360 ekuirektangular (rasio 2:1) menjadi 6 sisi skybox Roblox (SkyboxFt, SkyboxBk, SkyboxLf, SkyboxRt, SkyboxUp, SkyboxDn) tanpa celah sambungan (zero seam).

## Fitur Utama
1. Konversi WebGL shader GLSL ES 1.00 (PRD 5.2) murni di GPU lokal.
2. Preview Cross Net 2D interaktif pada 60 FPS (256 px).
3. Preview 3D Three.js dengan Roblox Baseplate, dummy character 3D, FOV zoom (40-100), dan drag camera berinersia.
4. Wireframe Seam mode (EdgesGeometry) tanpa glitch garis diagonal.
5. Fade Horizon smoothstep dan watermark logo sisi Dn dengan kontrol skala dan opasitas.
6. Generator script Luau untuk ServerScriptService dengan Image ID numerik.
7. Ekspor individual PNG dan berkas ZIP (512, 1024, 2048 px).
8. Stitcher: gabungkan 6 sisi skybox kembali menjadi satu panorama untuk diedit ulang.

## Struktur Proyek
```
skybox-studio/
├── index.html
├── css/
│   └── app.css
├── js/
│   ├── gl-convert.js     # shader WebGL (equirectangular -> cube face)
│   ├── testpattern.js    # generator panorama uji
│   ├── viewer3d.js       # preview 3D Three.js
│   ├── zip-export.js     # ekspor PNG / ZIP
│   ├── luau.js           # generator script Luau
│   ├── stitcher.js       # gabungkan 6 sisi -> panorama
│   ├── roblox-upload.js  # UI + orkestrasi upload langsung ke Roblox
│   └── main.js           # wiring UI + state aplikasi
├── api/
│   ├── roblox-create.js  # Serverless Function: proxy buat asset (hindari CORS)
│   ├── roblox-poll.js    # Serverless Function: proxy cek status operation
│   └── _guard.js         # tolak request lintas-situs + Cache-Control: no-store
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
- Vercel: Framework Preset "Other", Output Directory ".", `vercel.json` sudah set `cleanUrls`, `framework: null`, `maxDuration` function, dan header keamanan dasar.
- GitHub Pages: Deploy dari branch `main`, folder root (hanya konversi/ekspor; upload langsung tidak tersedia).

## Upload Langsung ke Roblox (dari browser)
**Langkah singkat**
1. Buat API Key di [Creator Dashboard > Credentials](https://create.roblox.com/dashboard/credentials) dengan permission **Assets** (Read + Write); biarkan pembatasan IP mati karena IP Vercel berubah-ubah.
2. Buka situs yang di-deploy di Vercel, unggah panorama, lalu buka tab **Dashboard**.
3. Isi API Key dan User ID (atau Group ID), klik **Upload ke Roblox**. Tiap sisi dirender, diunggah, dan Image ID langsung terisi di form script Luau begitu selesai.

Ini jalan lewat 2 Serverless Function (`api/roblox-create.js`, `api/roblox-poll.js`) karena Roblox Open Cloud tidak mengizinkan request langsung dari browser (CORS). Browser memanggil `/api/*` (same-origin), lalu function meneruskannya server-to-server ke Roblox. API key hanya diteruskan per request, tidak disimpan. Request lintas-situs ditolak (`api/_guard.js`).

**Akun tersimpan.** Di tab Dashboard, isi form lalu klik **Simpan akun** supaya tidak mengetik ulang. Data disimpan di `localStorage` browser itu saja (tidak dikirim ke server). Kalau kamu mengisi kata sandi brankas, API key dienkripsi (AES-GCM, kunci dari PBKDF2) dan kata sandi diminta lagi saat menekan **Pakai**; tanpa kata sandi, key tersimpan sebagai teks biasa. Jangan simpan key di komputer bersama.

**Batas 4,5 MB.** Vercel membatasi body request function sampai 4,5 MB. Kalau PNG satu sisi lebih besar dari ±4,2 MB, aplikasi otomatis memperkecil resolusinya bertahap (minimum 512 px) dan mencatatnya di log. Kalau tetap tidak muat, pakai `upload-skybox.mjs`.

**Kalau gagal di tengah jalan.** Sisi yang sudah berhasil tetap tersimpan dan ID-nya sudah terisi. Tekan **Upload ke Roblox** lagi untuk melanjutkan (operasi yang masih diproses/moderasi dicek ulang, bukan diunggah ulang). **Mulai dari awal** mengunggah semua sisi dari nol, misalnya setelah mengganti panorama.

**Keterbatasan:** butuh backend (Vercel atau hosting lain yang mendukung Node serverless functions). **Tidak jalan di GitHub Pages**; di sana pakai skrip terminal di bawah.

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

Kalau kamu meng-upgrade versi library ini, pastikan hash SRI di `index.html` diperbarui juga (ambil dari [cdnjs.com](https://cdnjs.com)), kalau tidak browser akan memblokir script-nya tanpa error yang terlihat oleh user.

## Batasan & Moderasi Roblox
- Resolusi input otomatis disesuaikan dengan batas `MAX_TEXTURE_SIZE` GPU peramban.
- Gambar tunduk pada Roblox Community Standards; hindari konten berhak cipta terlarang.

## Kontribusi
Issue dan PR dipersilakan. Proyek ini sengaja dibuat tanpa dependency/build step, jadi perubahan langsung ke file `js/*.js` yang relevan.

## Lisensi
MIT — lihat [LICENSE](LICENSE).

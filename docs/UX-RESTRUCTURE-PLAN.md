# Restrukturisasi UX — DIEKSEKUSI di v1.3.0 (2026-11-10)

> Ide disimpan setelah benchmarking terhadap terakhircommunity.com/tools/skybox-converter/app
> (2026-11-10). Prinsipnya: **progressive disclosure** — semua fitur existing tetap ada,
> hanya ditata ulang mengikuti alur: *buka → upload → lihat → pasang*.

## Masalah UX saat ini (v1.2.0)

- 6 tab campuran tampilan + tugas (Cross, 3D, Upload Roblox, Stitcher, Batch, AI Prompt).
- ±15 slider + 2 color picker + 3 grup segmen + watermark **semua terbuka** sejak awal.
- 2 preview terpisah (Cross & 3D) bikin ragu mana yang dipakai.
- Form upload panjang: login gate → API key → owner type → prefix → type → 6 kartu → log.
- Langkah pemasangan (Command Bar) tidak ditonjolkan.
- Empty state berupa grid teknis, bukan ajakan.

## 5 Poin restruktur

1. **Tab 6 → 4**
   - `Konversi` — Preview 3D jadi default; Cross jadi toggle kecil di dalam panel.
   - `Roblox` — wizard 3 langkah: *Akun → Cek hasil → Pasang* (upload + pemasangan satu alur).
   - `Alat` — Stitcher + Batch jadi sub-tab dalam satu panel.
   - `AI Prompt` — tetap.
2. **Kontrol bertingkat** — Resolusi tetap terlihat; Posisi & Horizon, Warna & Suhu,
   Watermark, Koreksi orientasi digulung jadi satu `<details>` "Pengaturan Lanjutan"
   (tertutup default). Preset tampilan tetap akses cepat.
3. **Form upload dipersingkat** — tampil: API Key + User ID + tombol Upload.
   Owner type / prefix / type / vault pindah ke "Opsi lanjutan" (details).
4. **Empty state ramah** — panel kosong jadi onboarding 3 langkah + tombol
   "Coba langit contoh" (2–3 langit prosedural yang cantik, bukan grid test pattern).
5. **Tips inline** — 1 baris tips moderasi + link panduan persis di dekat tombol upload.

## Acuan (hasil bedah terakhircommunity.com)

- Tab 4 task-oriented; tampilan awal benar-benar kosong (0 slider/0 input sebelum upload).
- Kontrol bertahap setelah gambar masuk; satu preview 3D sebagai pusat.
- "Salin script Command Bar" ditonjolkan sebagai cara utama pemasangan.
- Login opsional (gate hanya untuk fitur lanjutan), tips moderasi inline.
- Keunggulan yang tetap harus dipertahankan dari app kita: preset tampilan, fade
  horizon/atas, seam blend, watermark bebas, batch, paket ganti-langit, stitcher,
  vault + sinkron, dan konvensi sisi Roblox yang terverifikasi empiris.

## Acuan 2: NX Community (nx.dimszyhub.my.id/tools/skybox.html, dibedah 2026-11-10)

Tool super-minimal: 1 halaman, 2 "Langkah", 0 tab, 0 slider (semua select), **tanpa
preview 3D sama sekali**. Tapi alur upload-nya paling mulus dari semua pembanding:

- **"Login pakai Roblox"** — OAuth resmi Roblox via backend mereka
  (`116-212-73-233.sslip.io`, VPS self-host; sesi via `#nxsesi=` hash → localStorage).
  User **tidak pernah melihat API key**.
- **"Upload & Download Sky"** — 1 klik: POST 6 PNG ke backend → backend upload ke
  akun Roblox user (mode `oauth`) atau lewat akun alt milik server (mode `alt`,
  tanpa login sama sekali) → ID otomatis terisi → **file .rbxmx otomatis
  ke-download**. Upload → beres, tanpa langkah kedua.
- Feedback moderasi per sisi + peringatan decal/Image dari respons backend.
- Prompt AI berformat "template + placeholder `[Ganti Ini]`" dengan aturan tepi
  wraparound yang detail (tepi kiri=kanan polos, horizon di tengah).
- **"Cermin langit"** untuk sisi bawah — cermin setengah atas ke bawah, buat map
  melayang. Pintar untuk niche Roblox.
- Konvensi sisi: tabel rotasi per-face SEMUA 0 + select rotasi Up/Dn manual ke user —
  **tidak menangani konvensi Roblox** (bug yang sama dengan pembanding lain); tidak ada
  Lf/Rt swap. Kita tetap satu-satunya yang benar secara empiris.

### Ide tambahan yang layak diadopsi (masuk rencana)

6. **Auto-rbxmx setelah upload** — begitu 6 ID terisi dari upload, langsung generate +
   unduh .rbxmx otomatis (tanpa klik kedua). Murah, efek besar.
7. **Fast-path OAuth Roblox** (jangka menengah; butuh riset scope OAuth Roblox +
   backend Vercel) — login Roblox → upload atas nama user tanpa API key. Fallback
   tetap API key.
8. **Template prompt `[Ganti Ini]`** — satu prompt dasar editable + placeholder tema,
   di samping pustaka 16 prompt yang sudah ada.
9. **Opsi sisi bawah "Cermin langit"** — untuk pembuat map melayang.


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

## Deployment Vercel & GitHub Pages
- Vercel: Framework Preset "Other", Output Directory ".", vercel.json cleanUrls dan framework null.
- GitHub Pages: Deploy dari branch main root.

## Skrip upload-skybox.mjs
Gunakan kredensial ROBLOX_API_KEY untuk unggah 6 sisi langsung ke Open Cloud Assets API.
Catatan: Jika skybox tampil putih di game, salin Image ID dari Asset Manager di Roblox Studio (bukan Decal ID).

## Dependensi & Hash SRI
- Three.js r128 (cdnjs): sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==
- JSZip 3.10.1 (cdnjs): sha512-XMVd28F1oH/O71fKEHdDUCZhrMpU29vm493tVSh9SkK3QXNDEnUtLXAHIjMQlWTZ8797eiZeQmhy+z3Z555b7Q==

## Batasan & Moderasi Roblox
- Resolusi input otomatis disesuaikan dengan batas MAX_TEXTURE_SIZE GPU peramban.
- Gambar tunduk pada Roblox Community Standards; hindari konten berhak cipta terlarang.

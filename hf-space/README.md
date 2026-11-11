# Backend AI 360 — Hugging Face Space (ZeroGPU, gratis)

Backend untuk fitur **AI 360** di NAKA Studio: mengubah gambar 2D biasa menjadi
panorama equirectangular 2:1 yang seamless (tepi kiri–kanan nyambung) menggunakan
Stable Diffusion Inpainting dengan **circular horizontal tiling**.

## Cara deploy (sekali saja, ±5 menit)

1. Buat akun di [huggingface.co](https://huggingface.co) (gratis).
2. Pojok kanan atas → **New Space**:
   - Space name: `skybox-360-backend`
   - SDK: **Gradio**
   - Hardware: **ZeroGPU** (gratis)
   - Visibility: Public
3. Di Space, buat 2 file:
   - `requirements.txt` — salin isi file `requirements.txt` di folder ini
   - `app.py` — salin isi file `app.py` di folder ini
4. Tunggu status Space menjadi **Running** (build pertama ±3–5 menit).
5. Salin alamat Space, contoh: `username-skybox-360-backend.hf.space`
6. Buka NAKA Studio → tab **AI 360** → tempel alamat itu ke kolom URL Space.

Selesai. Setelah itu: pilih gambar 2D → pilih gaya → Generate 360° →
"Gunakan Hasil di Konversi" → ekspor 6 sisi / upload ke Roblox seperti biasa.

## Catatan

- Model: `stabilityai/stable-diffusion-2-inpainting` (runwayml versi lama sudah
  dihapus dari HF Hub).
- ZeroGPU: kuota gratis per akun; kalau antre penuh, coba lagi nanti.
- Output 1024×512 equirectangular; area tengah 256×128 adalah gambar asli Anda
  (FOV horizontal ~90°), sisanya di-outpaint AI dengan tiling melingkar.

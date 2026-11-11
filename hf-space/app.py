import spaces          # WAJIB paling atas sebelum torch/diffusers (aturan ZeroGPU)
import gradio as gr
import torch
from PIL import Image, ImageOps, ImageFilter, ImageDraw
import numpy as np
from diffusers import StableDiffusionInpaintPipeline
import tempfile, os

# Catatan: runwayml & stabilityai versi inpainting sudah dihapus dari HF Hub.
# botp/stable-diffusion-v1-5-inpainting = mirror resmi SD1.5-inpainting yang masih hidup & tidak gated.
model_id = "botp/stable-diffusion-v1-5-inpainting"
pipe = StableDiffusionInpaintPipeline.from_pretrained(
    model_id,
    torch_dtype=torch.float16
)
pipe = pipe.to("cuda")

# Trik circular tiling pada sumbu X: padding konvolusi melingkar sehingga
# tepi kiri dan kanan hasil outpainting dijamin menyambung mulus (seamless 360°).
def enable_horizontal_tiling(pipe):
    for module in pipe.vae.modules():
        if isinstance(module, torch.nn.Conv2d):
            module.padding_mode = 'circular'
    for module in pipe.unet.modules():
        if isinstance(module, torch.nn.Conv2d):
            module.padding_mode = 'circular'

enable_horizontal_tiling(pipe)

STYLES = {
    "auto — samakan dengan gambar (rekomendasi)": "seamless 360 panorama, continue the scenery, consistent style with the image, highly detailed",
    "realistic clear sky, fluffy clouds": "realistic clear blue sky, fluffy white clouds",
    "night stars and nebula, deep blue": "night sky, stars, nebula, deep blue gradient",
    "dramatic sunset clouds, golden hour": "dramatic sunset, golden hour, orange clouds",
    "cyberpunk neon city skyline": "cyberpunk neon city skyline at night, futuristic",
    "anime fantasy landscape, stylized": "anime fantasy landscape, stylized painterly",
}

def detect_horizon_row(img):
    """Deteksi baris horizon (transisi langit→darat terkuat) di pita tengah gambar."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    y0, y1 = int(h * 0.25), int(h * 0.75)
    band = arr[y0:y1]
    if band.shape[0] < 4:
        return int(h * 0.5)
    diff = np.abs(np.diff(band, axis=0)).mean(axis=(1, 2))
    # rata-rata bergerak kecil supaya tidak terpengaruh noise 1 baris
    k = 3
    smooth = np.convolve(diff, np.ones(k) / k, mode="same")
    return y0 + int(np.argmax(smooth))

@spaces.GPU
def generate_skybox(input_image, prompt_style):
    if input_image is None:
        return None, None

    target_w, target_h = 1024, 512

    # Gambar input dipasang mengisi FOV horizontal ~90° di tengah
    input_w = target_w // 4
    input_h = target_h // 2
    resized_input = ImageOps.fit(input_image, (input_w, input_h), Image.Resampling.LANCZOS)

    # ── Sejajarkan horizon: baris horizon gambar diletakkan tepat di v=0.5 ──
    horizon_row = detect_horizon_row(resized_input)
    paste_y = int((target_h - input_h) / 2 + (0.5 - horizon_row / input_h) * input_h)
    paste_y = max(int(target_h * 0.05), min(target_h - input_h - int(target_h * 0.05), paste_y))
    paste_x = (target_w - input_w) // 2

    # Kanvas BUKAN hitam: gradien langit→tanah dari warna gambar sendiri,
    # memberi petunjuk arah dunia ke AI (mencegah "tanah di langit").
    px = np.asarray(resized_input, dtype=np.float32)
    top_strip = px[: max(1, input_h // 10)].mean(axis=(0, 1))          # rata-rata tepi atas gambar
    bottom_strip = px[-max(1, input_h // 10):].mean(axis=(0, 1))       # rata-rata tepi bawah gambar
    canvas_np = np.zeros((target_h, target_w, 3), dtype=np.float32)
    for y in range(target_h):
        k = y / (target_h - 1)
        canvas_np[y, :] = top_strip * (1 - k) + bottom_strip * k
    canvas = Image.fromarray(np.clip(canvas_np, 0, 255).astype(np.uint8))
    canvas.paste(resized_input, (paste_x, paste_y))

    # Mask: hitam = pertahankan gambar asli, putih = area yang di-outpaint AI
    mask = Image.new("L", (target_w, target_h), 255)
    keep_mask = Image.new("L", (input_w, input_h), 0)
    mask.paste(keep_mask, (paste_x, paste_y))

    style = STYLES.get(prompt_style, prompt_style)
    neutral = "auto" in prompt_style
    prompt = (
        f"360 degree equirectangular panorama, seamless skybox, {style}, "
        f"consistent horizon line, highly detailed, high resolution"
    )
    negative_prompt = "lowres, distortion, seam, border, line, cut, text, watermark, vertical lines, blurry"

    result = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        image=canvas,
        mask_image=mask,
        num_inference_steps=24,
        guidance_scale=5.0 if neutral else 7.5
    ).images[0]

    # ── Upscale 2× ke 2048×1024 + tempel gambar asli resolusi penuh (tajam!) ──
    big_w, big_h = target_w * 2, target_h * 2
    big = result.resize((big_w, big_h), Image.LANCZOS)
    src_big_w = big_w // 4
    src_big_h = big_h // 2
    src_big = ImageOps.fit(input_image, (src_big_w, src_big_h), Image.Resampling.LANCZOS)
    paste_y2 = paste_y * 2
    paste_x2 = (big_w - src_big_w) // 2

    feather = 56
    fmask = Image.new("L", (src_big_w, src_big_h), 0)
    dr = ImageDraw.Draw(fmask)
    dr.rectangle([feather // 2, feather // 2, src_big_w - feather // 2, src_big_h - feather // 2], fill=255)
    fmask = fmask.filter(ImageFilter.GaussianBlur(feather / 2))
    big.paste(src_big, (paste_x2, paste_y2), fmask)

    # Simpan PNG full-res — gradio 6 mengecilkan preview webp, file ini yang
    # dipakai NAKA Studio agar resolusi tidak hilang.
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    big.save(tmp.name)
    return big, tmp.name

ui = gr.Interface(
    fn=generate_skybox,
    inputs=[
        gr.Image(type="pil", label="Input 2D Image"),
        gr.Dropdown(
            choices=list(STYLES.keys()),
            value=list(STYLES.keys())[0],
            label="Environment Style"
        )
    ],
    outputs=[
        gr.Image(type="pil", label="Preview hasil"),
        gr.File(label="PNG equirect 2048×1024 — dipakai NAKA Studio")
    ],
    title="2D to 360° Skybox Outpainting (NAKA Studio backend)",
    description="Masukkan gambar 2D biasa — horizon disejajarkan otomatis, AI mengisi sisa 270° lingkaran dengan circular tiling seamless, gambar asli ditempel ulang resolusi penuh."
)

if __name__ == "__main__":
    ui.launch()

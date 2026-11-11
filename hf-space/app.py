import spaces          # WAJIB paling atas sebelum torch/diffusers (aturan ZeroGPU)
import gradio as gr
import torch
from PIL import Image, ImageOps
import numpy as np
from diffusers import StableDiffusionInpaintPipeline

# Catatan: runwayml/stable-diffusion-inpainting sudah dihapus dari HF Hub.
# stabilityai/stable-diffusion-2-inpainting licin (CreativeML Open R++) dan bekerja sama.
model_id = "stabilityai/stable-diffusion-2-inpainting"
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
    "realistic clear sky, fluffy clouds": "realistic clear blue sky, fluffy white clouds",
    "night stars and nebula, deep blue": "night sky, stars, nebula, deep blue gradient",
    "dramatic sunset clouds, golden hour": "dramatic sunset, golden hour, orange clouds",
    "cyberpunk neon city skyline": "cyberpunk neon city skyline at night, futuristic",
    "anime fantasy landscape, stylized": "anime fantasy landscape, stylized painterly",
}

@spaces.GPU
def generate_skybox(input_image, prompt_style):
    if input_image is None:
        return None

    target_w, target_h = 1024, 512

    # Gambar input dipasang di tengah (FOV horizontal ~90°)
    input_w = target_w // 4
    input_h = target_h // 2
    resized_input = ImageOps.fit(input_image, (input_w, input_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (target_w, target_h), (0, 0, 0))
    paste_x = (target_w - input_w) // 2
    paste_y = (target_h - input_h) // 2
    canvas.paste(resized_input, (paste_x, paste_y))

    # Mask: hitam = pertahankan gambar asli, putih = area yang di-outpaint AI
    mask = Image.new("L", (target_w, target_h), 255)
    keep_mask = Image.new("L", (input_w, input_h), 0)
    mask.paste(keep_mask, (paste_x, paste_y))

    style = STYLES.get(prompt_style, prompt_style)
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
        guidance_scale=7.5
    ).images[0]

    return result

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
    outputs=gr.Image(type="pil", label="360 Equirectangular Skybox (2:1)"),
    title="2D to 360° Skybox Outpainting (NAKA Studio backend)",
    description="Masukkan gambar 2D biasa — AI mengisi sisa 270° lingkaran + kutub dengan circular horizontal tiling agar tepi kiri–kanan seamless. Hasil rasio 2:1 siap dipakai sebagai skybox."
)

if __name__ == "__main__":
    ui.launch()

import spaces          # WAJIB paling atas sebelum torch/diffusers (aturan ZeroGPU)
import os
import sys
import subprocess
import tempfile

# ── Package pano (txt2panoimg + img2panoimg + mask) diambil dari repo NAKA ──
# saat startup, sehingga di Space Anda cukup update SATU file app.py saja.
VENDOR = "/tmp/naka-vendor"
if not os.path.isdir(os.path.join(VENDOR, "hf-space", "img2panoimg")):
    subprocess.run(
        ["git", "clone", "--depth", "1",
         "https://github.com/Ihsan-ct/skybox-studio.git", VENDOR],
        check=True, capture_output=True
    )
sys.path.insert(0, os.path.join(VENDOR, "hf-space"))

import gradio as gr

try:
    import RealESRGAN   # standalone, tanpa basicsr
except ImportError:
    subprocess.run(
        [sys.executable, "-m", "pip", "install",
         "git+https://github.com/inference-sh/Real-ESRGAN.git",
         "--no-deps", "--no-build-isolation"],
        check=True
    )

import torch
from huggingface_hub import snapshot_download
from img2panoimg import Image2360PanoramaImagePipeline
from PIL import Image

# Model pano-trained: UNet dilatih khusus equirect (paper Diffusion360)
model_path = snapshot_download("archerfmy0831/sd-t2i-360panoimage")
img2pano = Image2360PanoramaImagePipeline(model_path, torch_dtype=torch.float16)

MASK = Image.open(os.path.join(VENDOR, "hf-space", "i2p-mask.jpg")).convert("RGB")

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
        return None, None

    # Input 512×512 + mask "lensa" bawaan → pano equirect 1024×512 native
    image = input_image.convert("RGB").resize((512, 512), Image.LANCZOS)
    out = img2pano({
        "prompt": STYLES.get(prompt_style, prompt_style),
        "image": image,
        "mask": MASK.copy(),
        "upscale": False,
    })

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    out.save(tmp.name)
    return out, tmp.name


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
        gr.File(label="PNG equirect 1024×512 — dipakai NAKA Studio")
    ],
    title="2D to 360° Skybox (NAKA Studio backend — pano-native Diffusion360)",
    description="Masukkan gambar 2D — UNet pano-trained mengisi 360° secara native: seamless, horizon benar, tanpa tanah di langit. Hasil rasio 2:1 untuk NAKA Studio."
)

if __name__ == "__main__":
    ui.launch()

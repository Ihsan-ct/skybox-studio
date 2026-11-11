import spaces          # WAJIB paling atas (aturan ZeroGPU)
import os
import tempfile

import gradio as gr
import torch
import numpy as np
from PIL import Image, ImageOps, ImageDraw

from transformers import Qwen2_5_VLForConditionalGeneration
from diffusers import (
    QwenImagePipeline,
    QwenImageTransformer2DModel,
    QwenImageInpaintPipeline,
)
from optimum.quanto import quantize, qint8, freeze

MODEL_ID = "Qwen/Qwen-Image"
LORA_ID = "ProGamerGov/qwen-360-diffusion"
LORA_FILE = "qwen-360-diffusion-int8-bf16-v1.safetensors"

STYLES = {
    "realistic clear sky, fluffy clouds": "realistic clear blue sky, fluffy white clouds",
    "night stars and nebula, deep blue": "night sky, stars, nebula, deep blue gradient",
    "dramatic sunset clouds, golden hour": "dramatic sunset, golden hour, orange clouds",
    "cyberpunk neon city skyline": "cyberpunk neon city skyline at night, futuristic",
    "anime fantasy landscape, stylized": "anime fantasy landscape, stylized painterly",
}

_pipe_cache = {}

def shift_equirect(img):
    """Roll horizontal 50% untuk membuka seam di tengah."""
    t = torch.from_numpy(np.array(img)).permute(2, 0, 1).float() / 255.0
    t = torch.roll(t, shifts=(0, t.shape[2] // 2), dims=(1, 2))
    return Image.fromarray((t.permute(1, 2, 0).numpy() * 255).astype(np.uint8))

def create_seam_mask(w, h, frac=0.10):
    """Mask pita vertikal di tengah (seam) untuk pass perbaikan."""
    mask = torch.zeros((h, w))
    seam_w = max(1, int(w * frac))
    c = w // 2
    mask[:, c - seam_w // 2:c + seam_w // 2] = 1.0
    return Image.fromarray((mask.numpy() * 255).astype("uint8"), "L")

def get_pipe(mode):
    """Bangun pipeline sekali (transformer + text encoder di-quantize INT8),
    lalu di-cache — kedua mode berbagi bobot yang sama."""
    if mode in _pipe_cache:
        return _pipe_cache[mode]

    # 1) Transformer INT8 di CPU (~20 GB setelah quantize)
    transformer = QwenImageTransformer2DModel.from_pretrained(
        MODEL_ID, subfolder="transformer",
        torch_dtype=torch.bfloat16, low_cpu_mem_usage=True
    )
    quantize(transformer, weights=qint8)
    freeze(transformer)

    # 2) Text encoder INT8 di CPU
    text_encoder = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_ID, subfolder="text_encoder",
        torch_dtype=torch.bfloat16, low_cpu_mem_usage=True,
        device_map={"": "cpu"}
    )
    quantize(text_encoder, weights=qint8)
    freeze(text_encoder)

    # 3) Pipeline (LoRA pano + cpu offload + vae tiling)
    cls = QwenImagePipeline if mode == "t2i" else QwenImageInpaintPipeline
    pipe = cls.from_pretrained(
        MODEL_ID, transformer=transformer, text_encoder=text_encoder,
        torch_dtype=torch.bfloat16, use_safetensors=True, low_cpu_mem_usage=True
    )
    pipe.load_lora_weights(LORA_ID, weight_name=LORA_FILE)
    pipe.enable_model_cpu_offload()
    pipe.enable_vae_tiling()

    _pipe_cache[mode] = pipe
    return pipe

@spaces.GPU(duration=240)
def generate_skybox(input_image, prompt_style):
    prompt = STYLES.get(prompt_style, prompt_style)
    negative_prompt = ""
    width, height = 2048, 1024
    steps, cfg = 25, 4.0

    if input_image is not None:
        # Mode gambar→pano: gambar user ditempel di band tengah (FOV ~90°),
        # sisanya di-outpaint pano-LoRA.
        iw, ih = width // 4, height // 2
        fitted = ImageOps.fit(input_image.convert("RGB"), (iw, ih), Image.LANCZOS)
        px, py = (width - iw) // 2, (height - ih) // 2
        canvas = Image.new("RGB", (width, height), (0, 0, 0))
        canvas.paste(fitted, (px, py))
        mask = Image.new("L", (width, height), 255)
        ImageDraw.Draw(mask).rectangle([px, py, px + iw, py + ih], fill=0)
        pipe = get_pipe("inpaint")
        image = pipe(
            prompt=prompt, negative_prompt=negative_prompt,
            image=canvas, mask_image=mask,
            width=width, height=height,
            num_inference_steps=steps, true_cfg_scale=cfg,
        ).images[0]
    else:
        pipe = get_pipe("t2i")
        image = pipe(
            prompt=prompt, negative_prompt=negative_prompt,
            width=width, height=height,
            num_inference_steps=steps, true_cfg_scale=cfg,
        ).images[0]

    # Pass perbaikan seam: roll 50% + inpaint pita tengah
    shifted = shift_equirect(image)
    seam_mask = create_seam_mask(width, height)
    pipe = get_pipe("inpaint")
    image = pipe(
        prompt=prompt, negative_prompt=negative_prompt,
        image=shifted, mask_image=seam_mask,
        strength=0.5, width=width, height=height,
        num_inference_steps=steps, true_cfg_scale=cfg,
    ).images[0]
    image = shift_equirect(image)

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    image.save(tmp.name)
    return image, tmp.name

ui = gr.Interface(
    fn=generate_skybox,
    inputs=[
        gr.Image(type="pil", label="Input 2D Image (opsional — kosongkan untuk text-only)"),
        gr.Dropdown(choices=list(STYLES.keys()), value=list(STYLES.keys())[0], label="Environment Style"),
    ],
    outputs=[
        gr.Image(type="pil", label="Preview hasil"),
        gr.File(label="PNG equirect 2048×1024 — dipakai NAKA Studio"),
    ],
    title="Qwen-360 SOTA (NAKA Studio backend kedua)",
    description="Qwen-Image 20B + LoRA pano (32k equirect terverifikasi manual). INT8 + cpu offload untuk ZeroGPU. Output 2048×1024 + perbaikan seam otomatis."
)

if __name__ == "__main__":
    ui.launch()

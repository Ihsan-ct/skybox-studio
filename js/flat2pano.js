"use strict";
/*
 * Flat2Pano: mengubah gambar 2D biasa (foto / render / hasil AI berbentuk persegi panjang)
 * menjadi panorama equirectangular 2:1 yang tepi kiri-kanannya menyambung.
 *
 * Cara kerja:
 *  1. Gambar diletakkan di depan kamera sebagai proyeksi perspektif (rectilinear) dengan
 *     sudut pandang horizontal tertentu, sehingga bentuk objek (mis. bulan) tetap bulat.
 *  2. Sisa bola langit diisi dengan Hybrid push-pull + mirror extension, blur, dan
 *     blending warna agar menyambung di sekeliling 360°.
 *  3. Dekat kutub atas/bawah, warna dirata-ratakan agar tidak muncul pusaran.
 */
window.Flat2Pano = (function () {
  const PI = Math.PI;

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function getPixels(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }

  // Bilinear sample dari RGBA Uint8 (tanpa wrap). u,v dalam piksel (0..w-1).
  function sampleU8(d, w, h, x, y, out) {
    if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
    if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
    const x0 = x | 0, y0 = y | 0;
    const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out[0] = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
    out[1] = d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
    out[2] = d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
  }

  // --- Push-pull: isi area kosong dengan warna dari sekitarnya (wrap horizontal) ---
  function downsample(src, w, h) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const dst = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const o = (y * nw + x) * 4;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy);
            const i = (sy * w + sx) * 4;
            dst[o] += src[i] * 0.25; dst[o + 1] += src[i + 1] * 0.25;
            dst[o + 2] += src[i + 2] * 0.25; dst[o + 3] += src[i + 3] * 0.25;
          }
        }
      }
    }
    return { data: dst, w: nw, h: nh };
  }

  function bilinearUp(src, sw, sh, dw, dh) {
    const dst = new Float32Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sh / dh - 0.5));
      const y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < dw; x++) {
        let fx = (x + 0.5) * sw / dw - 0.5;
        let x0 = Math.floor(fx); const tx = fx - x0;
        const xa = ((x0 % sw) + sw) % sw, xb = (xa + 1) % sw; // wrap horizontal
        const o = (y * dw + x) * 4;
        for (let c = 0; c < 4; c++) {
          const a = src[(y0 * sw + xa) * 4 + c] * (1 - tx) + src[(y0 * sw + xb) * 4 + c] * tx;
          const b = src[(y1 * sw + xa) * 4 + c] * (1 - tx) + src[(y1 * sw + xb) * 4 + c] * tx;
          dst[o + c] = a * (1 - ty) + b * ty;
        }
      }
    }
    return dst;
  }

  function pushPull(base, w, h) {
    const levels = [{ data: base, w, h }];
    while (levels[levels.length - 1].w > 4 && levels[levels.length - 1].h > 2) {
      const l = levels[levels.length - 1];
      levels.push(downsample(l.data, l.w, l.h));
    }
    let cur = levels[levels.length - 1].data;
    for (let i = levels.length - 2; i >= 0; i--) {
      const L = levels[i], C = levels[i + 1];
      const up = bilinearUp(cur, C.w, C.h, L.w, L.h);
      const out = new Float32Array(L.w * L.h * 4);
      for (let p = 0; p < L.w * L.h; p++) {
        const a = Math.min(1, L.data[p * 4 + 3]);
        const k = 1 - a;
        out[p * 4] = L.data[p * 4] + k * up[p * 4];
        out[p * 4 + 1] = L.data[p * 4 + 1] + k * up[p * 4 + 1];
        out[p * 4 + 2] = L.data[p * 4 + 2] + k * up[p * 4 + 2];
        out[p * 4 + 3] = L.data[p * 4 + 3] + k * up[p * 4 + 3];
      }
      cur = out;
    }
    // un-premultiply ke RGB 0..255
    const rgb = new Float32Array(w * h * 3);
    for (let p = 0; p < w * h; p++) {
      const a = Math.max(1e-4, cur[p * 4 + 3]);
      rgb[p * 3] = cur[p * 4] / a; rgb[p * 3 + 1] = cur[p * 4 + 1] / a; rgb[p * 3 + 2] = cur[p * 4 + 2] / a;
    }
    return rgb;
  }

  // Box blur 3-channel, wrap horizontal, clamp vertikal (ukuran kecil, cukup cara langsung).
  function blurRGB(buf, w, h, rx, ry, passes) {
    let a = Float32Array.from(buf);
    for (let n = 0; n < passes; n++) {
      const b = new Float32Array(a.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let k = -rx; k <= rx; k++) s += a[(y * w + ((((x + k) % w) + w) % w)) * 3 + c];
            b[(y * w + x) * 3 + c] = s / (2 * rx + 1);
          }
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let k = -ry; k <= ry; k++) s += b[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 3 + c];
            a[(y * w + x) * 3 + c] = s / (2 * ry + 1);
          }
        }
      }
    }
    return a;
  }

  /**
   * @param {CanvasImageSource} src  gambar 2D
   * @param {number} sw lebar asli, @param {number} sh tinggi asli
   * @param {object} o { fov (derajat, 40..150), pitch (derajat, posisi tengah gambar terhadap horizon), edge (0..30 %), maxW }
   * @returns {HTMLCanvasElement} panorama 2:1
   */
  function convert(src, sw, sh, o) {
    const fov = Math.min(150, Math.max(30, o.fov || 100)) * PI / 180;
    const pitch = (o.pitch || 0) * PI / 180;
    const edge = Math.min(0.4, Math.max(0, (o.edge == null ? 10 : o.edge) / 100));
    const maxW = o.maxW || 4096;
    const fill = o.fill === 'halus' || o.fill === 'cermin' ? o.fill : 'hybrid';
    // Refleksi segitiga ke [0,1] - mengisi zona di luar gambar (mode cermin).
    const tri01 = t => { const m = ((t % 2) + 2) % 2; return 1 - Math.abs(m - 1); };

    // Lebar panorama: usahakan kerapatan piksel gambar asli terjaga, batasi 2048..maxW.
    let W = Math.round(sw * (2 * PI) / fov);
    W = Math.max(2048, Math.min(maxW, W));
    W = Math.round(W / 2) * 2;
    const H = W / 2;

    // Piksel sumber (batasi 4096 agar hemat memori)
    const sc = Math.min(1, 4096 / Math.max(sw, sh));
    const pw = Math.max(1, Math.round(sw * sc)), ph = Math.max(1, Math.round(sh * sc));
    const px = getPixels(src, pw, ph);

    const th = Math.tan(fov / 2);              // setengah lebar bidang gambar pada z=1
    const thv = th * ph / pw;                  // setengah tinggi
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    // Cakupan vertikal gambar terhadap latitude (dipakai refleksi mode cermin)
    const vfov = 2 * Math.atan(thv);
    const latTop = pitch + vfov / 2;

    // ── Peta dasar (fillMap) per mode ──
    // cermin: panel asli/cermin bergantian menutup 360 + tepi atas/bawah ditarik,
    //         lalu di-blur berat -> wash warna sadar-arah tanpa artefak duplikat.
    // halus : push-pull warna dari tepi gambar (perilaku lama).
    let fillMap = null, rowAvg = null;
    const LW = 256, LH = 128;
    if (fill === 'cermin' || fill === 'hybrid') {
      const nPanel = Math.ceil((2 * PI) / fov);
      const panelW = (2 * PI) / nPanel;
      const tile = document.createElement('canvas');
      tile.width = W; tile.height = H;
      const tctx = tile.getContext('2d');
      const timg = tctx.createImageData(W, H);
      const td = timg.data;
      const vfov2 = 2 * Math.atan(thv);
      const latT2 = pitch + vfov2 / 2;
      for (let y = 0; y < H; y++) {
        const lat = PI / 2 - (y + 0.5) / H * PI;
        const vh = Math.min(1, Math.max(0, (latT2 - lat) / vfov2));
        const sy = Math.min(ph - 1, Math.max(0, vh * (ph - 1)));
        const y0 = sy | 0, y1 = Math.min(ph - 1, y0 + 1), fy = sy - y0;
        for (let x = 0; x < W; x++) {
          const a = (x + 0.5) / W * nPanel;
          const p = Math.floor(a);
          const t = a - p;
          const xh = (p % 2 === 0) ? t : 1 - t;
          const sx = Math.min(pw - 1, Math.max(0, xh * (pw - 1)));
          const x0 = sx | 0, x1 = Math.min(pw - 1, x0 + 1), fx = sx - x0;
          const i00 = (y0 * pw + x0) * 4, i10 = (y0 * pw + x1) * 4;
          const i01 = (y1 * pw + x0) * 4, i11 = (y1 * pw + x1) * 4;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          const o4 = (y * W + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            td[o4 + ch] =
              px[i00 + ch] * w00 + px[i10 + ch] * w10 +
              px[i01 + ch] * w01 + px[i11 + ch] * w11;
          }
          td[o4 + 3] = 255;
        }
      }
      tctx.putImageData(timg, 0, 0);
      const fcan = document.createElement('canvas');
      fcan.width = W; fcan.height = H;
      const fctx = fcan.getContext('2d');
      try { fctx.filter = 'blur(' + Math.max(60, Math.round(W / 20)) + 'px)'; } catch (e) {}
      fctx.drawImage(tile, 0, 0);
      const fdata = fctx.getImageData(0, 0, W, H).data;
      fillMap = new Float32Array(LW * LH * 3);
      for (let y = 0; y < LH; y++) {
        const syv = Math.min(H - 1, Math.max(0, (y + 0.5) * H / LH - 0.5));
        const yy0 = syv | 0, yy1 = Math.min(H - 1, yy0 + 1), ty = syv - yy0;
        for (let x = 0; x < LW; x++) {
          const sxv = Math.min(W - 1, Math.max(0, (x + 0.5) * W / LW - 0.5));
          const xx0 = sxv | 0, xx1 = Math.min(W - 1, xx0 + 1), tx = sxv - xx0;
          const q00 = (yy0 * W + xx0) * 4, q10 = (yy0 * W + xx1) * 4;
          const q01 = (yy1 * W + xx0) * 4, q11 = (yy1 * W + xx1) * 4;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const o3 = (y * LW + x) * 3;
          for (let ch = 0; ch < 3; ch++) {
            fillMap[o3 + ch] =
              fdata[q00 + ch] * w00 + fdata[q10 + ch] * w10 +
              fdata[q01 + ch] * w01 + fdata[q11 + ch] * w11;
          }
        }
      }
      // Hybrid: gabungkan push-pull (warna yang mengikuti struktur gambar) dengan
      // mirror wash (warna tepi yang stabil). Ini tetap murni pemrosesan piksel lokal.
      if (fill === 'hybrid') {
        const base = new Float32Array(LW * LH * 4);
        const tmp = [0, 0, 0];
        const lowSrcW = Math.min(pw, 192);
        const lowSrcH = Math.max(1, Math.round(ph * lowSrcW / pw));
        const lowPx = getPixels(src, lowSrcW, lowSrcH);
        for (let y = 0; y < LH; y++) {
          const lat = PI / 2 - (y + 0.5) / LH * PI;
          const sl = Math.sin(lat), cl = Math.cos(lat);
          for (let x = 0; x < LW; x++) {
            const lon = (x + 0.5) / LW * 2 * PI - PI;
            const dx = cl * Math.sin(lon), dz = cl * Math.cos(lon);
            const yy = sl * cp - dz * sp, zz = sl * sp + dz * cp;
            if (zz <= 0.02) continue;
            const u = dx / zz / th * 0.5 + 0.5;
            const v = 0.5 - yy / zz / thv * 0.5;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            sampleU8(lowPx, lowSrcW, lowSrcH, u * (lowSrcW - 1), v * (lowSrcH - 1), tmp);
            const o4 = (y * LW + x) * 4;
            base[o4] = tmp[0]; base[o4 + 1] = tmp[1]; base[o4 + 2] = tmp[2]; base[o4 + 3] = 1;
          }
        }
        let pushed = pushPull(base, LW, LH);
        pushed = blurRGB(pushed, LW, LH, 5, 3, 1);
        // 68% push-pull mempertahankan gradasi/struktur; 32% mirror meredam
        // warna kosong yang terlalu rata dan membantu kesinambungan 360°.
        for (let i = 0; i < fillMap.length; i++) {
          fillMap[i] = pushed[i] * 0.68 + fillMap[i] * 0.32;
        }
      }
    } else {
      const base = new Float32Array(LW * LH * 4);
      const tmp = [0, 0, 0];
      const lowSrcW = Math.min(pw, 192), lowSrcH = Math.max(1, Math.round(ph * lowSrcW / pw));
      const lowPx = getPixels(src, lowSrcW, lowSrcH);
      for (let y = 0; y < LH; y++) {
        const lat = PI / 2 - (y + 0.5) / LH * PI;
        const sl = Math.sin(lat), cl = Math.cos(lat);
        for (let x = 0; x < LW; x++) {
          const lon = (x + 0.5) / LW * 2 * PI - PI;
          const dx = cl * Math.sin(lon), dz = cl * Math.cos(lon);
          const yy = sl * cp - dz * sp, zz = sl * sp + dz * cp;
          if (zz <= 0.02) continue;
          const u = dx / zz / th * 0.5 + 0.5, v = 0.5 - yy / zz / thv * 0.5;
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          sampleU8(lowPx, lowSrcW, lowSrcH, u * (lowSrcW - 1), v * (lowSrcH - 1), tmp);
          const o4 = (y * LW + x) * 4;
          base[o4] = tmp[0]; base[o4 + 1] = tmp[1]; base[o4 + 2] = tmp[2]; base[o4 + 3] = 1;
        }
      }
      fillMap = pushPull(base, LW, LH);
      fillMap = blurRGB(fillMap, LW, LH, 9, 5, 2);
    }
    // Rata-rata baris (meredam pusaran / menyetel kutub)
    rowAvg = new Float32Array(LH * 3);
    for (let y = 0; y < LH; y++) {
      let r = 0, g = 0, b = 0;
      for (let x = 0; x < LW; x++) { r += fillMap[(y * LW + x) * 3]; g += fillMap[(y * LW + x) * 3 + 1]; b += fillMap[(y * LW + x) * 3 + 2]; }
      rowAvg[y * 3] = r / LW; rowAvg[y * 3 + 1] = g / LW; rowAvg[y * 3 + 2] = b / LW;
    }

    // --- Render akhir ---
    // --- Render akhir ---
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const img = octx.createImageData(W, H);
    const od = img.data;

    const sinLon = new Float32Array(W), cosLon = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5) / W * 2 * PI - PI;
      sinLon[x] = Math.sin(lon); cosLon[x] = Math.cos(lon);
    }

    const poleStart = 62 * PI / 180, poleEnd = 88 * PI / 180;
    const s = [0, 0, 0];
    const bas = [0, 0, 0];

    for (let y = 0; y < H; y++) {
      const lat = PI / 2 - (y + 0.5) / H * PI;
      const sl = Math.sin(lat), cl = Math.cos(lat);

      const fyv = Math.min(LH - 1, Math.max(0, (y + 0.5) * LH / H - 0.5));
      const fy0 = fyv | 0, fy1 = Math.min(LH - 1, fy0 + 1), fty = fyv - fy0;
      const pw_ = smoothstep(poleStart, poleEnd, Math.abs(lat));
      const ra0 = fy0 * 3, ra1 = fy1 * 3;
      const avR = rowAvg[ra0] * (1 - fty) + rowAvg[ra1] * fty;
      const avG = rowAvg[ra0 + 1] * (1 - fty) + rowAvg[ra1 + 1] * fty;
      const avB = rowAvg[ra0 + 2] * (1 - fty) + rowAvg[ra1 + 2] * fty;

      for (let x = 0; x < W; x++) {
        const fxv = (x + 0.5) * LW / W - 0.5;
        const fx0f = Math.floor(fxv), ftx = fxv - fx0f;
        const fa = ((fx0f % LW) + LW) % LW, fb = (fa + 1) % LW;
        const i00 = (fy0 * LW + fa) * 3, i10 = (fy0 * LW + fb) * 3, i01 = (fy1 * LW + fa) * 3, i11 = (fy1 * LW + fb) * 3;
        const w00 = (1 - ftx) * (1 - fty), w10 = ftx * (1 - fty), w01 = (1 - ftx) * fty, w11 = ftx * fty;
        let r = fillMap[i00] * w00 + fillMap[i10] * w10 + fillMap[i01] * w01 + fillMap[i11] * w11;
        let g = fillMap[i00 + 1] * w00 + fillMap[i10 + 1] * w10 + fillMap[i01 + 1] * w01 + fillMap[i11 + 1] * w11;
        let b = fillMap[i00 + 2] * w00 + fillMap[i10 + 2] * w10 + fillMap[i01 + 2] * w01 + fillMap[i11 + 2] * w11;
        if (pw_ > 0) { r += (avR - r) * pw_; g += (avG - g) * pw_; b += (avB - b) * pw_; }

        // lapisan gambar tajam (perspektif)
        const dx = cl * sinLon[x], dz = cl * cosLon[x];
        const yy = sl * cp - dz * sp, zz = sl * sp + dz * cp;
        if (zz > 0.02) {
          const u = dx / zz / th * 0.5 + 0.5, v = 0.5 - yy / zz / thv * 0.5;
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            let m = 1;
            if (edge > 0) {
              const d = Math.min(u, 1 - u, v, 1 - v);
              m = smoothstep(0, edge, d);
            }
            if (m > 0) {
              sampleU8(px, pw, ph, u * (pw - 1), v * (ph - 1), s);
              r += (s[0] - r) * m; g += (s[1] - g) * m; b += (s[2] - b) * m;
            }
          }
        }

        const o4 = (y * W + x) * 4;
        od[o4] = r; od[o4 + 1] = g; od[o4 + 2] = b; od[o4 + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  // Menghaluskan pita atas & bawah kanvas (kutub equirectangular) secara bertahap —
  // meniru "Rapikan Atas & Bawah": makin dekat kutub, makin blur.
  function smoothPoles(canvas, bandFrac, s01) {
    if (s01 <= 0) return;
    const W = canvas.width, H = canvas.height;
    const B = Math.max(8, Math.round(H * bandFrac));
    const ctx = canvas.getContext('2d');
    const slices = 8;
    const sliceH = Math.max(2, Math.round(B / slices));
    for (let i = 0; i < slices; i++) {
      const blurPx = Math.round((slices - i) / slices * 26 * s01);
      // atas
      ctx.save();
      ctx.beginPath(); ctx.rect(0, i * sliceH, W, sliceH + 2); ctx.clip();
      ctx.filter = 'blur(' + blurPx + 'px)';
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
      // bawah
      ctx.save();
      ctx.beginPath(); ctx.rect(0, H - (i + 1) * sliceH, W, sliceH + 2); ctx.clip();
      ctx.filter = 'blur(' + blurPx + 'px)';
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }
    ctx.filter = 'none';
  }

  return { convert, smoothPoles };
})();

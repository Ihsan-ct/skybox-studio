"use strict";
(function () {
  const root = document.getElementById('panel-prompt');
  if (!root) return;

  const card = document.createElement('section');
  card.className = 'card';
  card.style.cssText = 'margin:0 0 16px;padding:14px;border-color:var(--accent)';
  card.innerHTML = `
    <h3 style="margin:0 0 4px">AI Image-to-Image · Panorama Roblox</h3>
    <p class="note" style="margin:0 0 12px">Ubah gambar referensi menjadi panorama langit 360° menggunakan provider AI yang kamu konfigurasi di server. Hasil disiapkan pada kanvas 2048 × 1024.</p>
    <label class="field"><span>Gambar referensi (PNG, JPG, WebP · maks. 8 MB)</span><input id="aiSource" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label class="field" style="display:block;margin-top:10px"><span>Instruksi / prompt</span><textarea id="aiPrompt" rows="4" maxlength="4000" style="width:100%;margin-top:5px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--text);font:inherit" placeholder="Contoh: pertahankan warna langit dan bentuk awan, perluas menjadi panorama langit pagi realistis, awan sedikit dan tersebar, cahaya matahari lembut di sisi kanan."></textarea></label>
    <div class="row"><button type="button" id="aiGenerate" class="primary">Generate panorama AI</button><span id="aiStatus" class="note" role="status" aria-live="polite"></span></div>
    <div id="aiResult" hidden style="margin-top:12px">
      <img id="aiPreview" alt="Preview panorama hasil AI" style="display:block;width:100%;max-height:300px;object-fit:contain;background:#050914;border:1px solid var(--line);border-radius:10px">
      <div class="row"><button type="button" id="aiUse">Gunakan di Converter</button><button type="button" id="aiDownload">Unduh PNG 2048×1024</button></div>
    </div>
    <p class="note" style="margin:10px 0 0">Privasi: gambar dikirim ke endpoint AI yang kamu atur. API key hanya berada di environment server, bukan di browser. Provider harus kompatibel dengan format OpenAI Images Edits dan mendukung ukuran 2048×1024.</p>
  `;
  root.prepend(card);

  const $ = id => card.querySelector('#' + id);
  let resultBlob = null;
  let resultUrl = null;

  function status(message, error) {
    $('aiStatus').textContent = message || '';
    $('aiStatus').style.color = error ? 'var(--err-line)' : 'var(--muted)';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal membaca gambar sumber.'));
      reader.readAsDataURL(file);
    });
  }

  function normalizePanorama(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const width = img.naturalWidth * scale;
        const height = img.naturalHeight * scale;
        ctx.drawImage(img, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal menyiapkan PNG panorama.')), 'image/png');
      };
      img.onerror = () => reject(new Error('Provider mengembalikan gambar yang tidak bisa dibaca.'));
      img.src = dataUrl;
    });
  }

  $('aiGenerate').addEventListener('click', async () => {
    const file = $('aiSource').files[0];
    const prompt = $('aiPrompt').value.trim();
    if (!file) return status('Pilih gambar referensi terlebih dahulu.', true);
    if (!prompt) return status('Tulis instruksi gambar terlebih dahulu.', true);
    if (file.size > 8 * 1024 * 1024) return status('Ukuran gambar maksimal 8 MB.', true);
    $('aiGenerate').disabled = true;
    $('aiResult').hidden = true;
    status('Mengirim gambar ke provider AI…');
    try {
      const image = await fileToDataUrl(file);
      const response = await fetch('/api/ai-image-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, prompt })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Permintaan AI gagal (HTTP ' + response.status + ').');
      resultBlob = await normalizePanorama(payload.image);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(resultBlob);
      $('aiPreview').src = resultUrl;
      $('aiResult').hidden = false;
      status('Selesai. Panorama siap dipakai di converter.');
    } catch (error) {
      status(error.message || 'Terjadi kesalahan saat generate.', true);
    } finally {
      $('aiGenerate').disabled = false;
    }
  });

  $('aiDownload').addEventListener('click', () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skybox-ai-2048x1024.png';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('aiUse').addEventListener('click', () => {
    if (!resultBlob) return;
    const file = new File([resultBlob], 'skybox-ai-2048x1024.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    status('Panorama dimuat ke converter. Lanjutkan preview 3D / ekspor / upload Roblox.');
    const tab = document.getElementById('tab-konversi');
    if (tab) tab.click();
  });

  window.addEventListener('beforeunload', () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  });
})();

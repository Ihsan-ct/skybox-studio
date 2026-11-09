"use strict";
// Pustaka prompt untuk membuat panorama 2:1 dengan generator gambar AI (Bing Image
// Creator, Midjourney, dan sejenisnya). Prompt ditulis agar hasilnya cocok dipakai
// langsung di tab konversi: equirectangular 2:1, sambungan kiri-kanan mulus, hanya langit.
window.PromptLib = (function () {
  // Suffix yang menata format output panorama; digabung ke setiap prompt saat disalin.
  const SUFFIX = ' 360-degree equirectangular sky panorama, 2:1 aspect ratio, seamless left-right wrap, sky only with no ground or buildings, soft glow near the bottom horizon, zenith detail near the top center.';
  const NEGATIVE = 'ground, terrain, city, buildings, trees, people, text, watermark, logo, visible seam, tiling artifacts, blurry, low quality';

  const PROMPTS = [
    { id: 'siang-cerah', cat: 'Realistis', label: 'Siang Cerah Berawan', text: 'Realistic bright daytime sky, scattered fluffy white cumulus clouds drifting in a vivid blue sky, warm sun glow near the horizon, gentle haze along the horizon line, deep saturated blue toward the zenith.' },
    { id: 'senja-emas', cat: 'Realistis', label: 'Senja Golden Hour', text: 'Realistic golden-hour dusk sky, warm orange and soft pink gradient, thin layered stratus clouds catching amber sunlight, cool blue emerging at the zenith, calm and cinematic.' },
    { id: 'langit-malam', cat: 'Realistis', label: 'Langit Malam Berbintang', text: 'Realistic night sky, dense field of small sharp stars, faint Milky Way band crossing the sky, deep navy at the zenith fading to dark blue near the horizon, no moon, natural astrophotography look.' },
    { id: 'badai-petir', cat: 'Cuaca', label: 'Badai Petir', text: 'Dramatic thunderstorm sky, towering dark cumulonimbus clouds, multiple bright lightning strikes, moody green-grey light, rain haze near the horizon, high contrast.' },
    { id: 'mendung-pagi', cat: 'Cuaca', label: 'Mendung Pagi', text: 'Overcast morning sky, soft flat grey-white cloud layer, subtle warm light diffusing through fog near the horizon, calm and muted, minimal contrast.' },
    { id: 'fantasi-awan', cat: 'Fantasi', label: 'Gunung Awan Surga', text: 'Fantasy heaven sky, towering mountains made of white glowing clouds, golden god rays breaking through, soft pastel blue background, epic scale, painterly.' },
    { id: 'fantasi-aurora', cat: 'Fantasi', label: 'Aurora Kutub', text: 'Arctic night sky, wide glowing curtains of green and purple aurora borealis, star field behind, snowy blue horizon glow, long-exposure astrophotography style.' },
    { id: 'fantasi-bulan', cat: 'Fantasi', label: 'Bulan Raksasa Fantasi', text: 'Fantasy night sky with an enormous glowing full moon dominating one side of the panorama, soft blue aurora ribbons, scattered bright stars, dark teal gradient sky.' },
    { id: 'fantasi-kristal', cat: 'Fantasi', label: 'Kristal Melayang', text: 'Fantasy sky filled with floating luminous crystal shards, magenta and cyan light refracting, deep indigo background with soft nebula haze, magical atmosphere.' },
    { id: 'antariksa-nebula', cat: 'Antariksa', label: 'Nebula Dalam', text: 'Deep space nebula panorama, billowing purple, blue and cyan gas clouds, dense star field, a few bright stars with subtle lens flare, pure black cosmic background.' },
    { id: 'antariksa-galaksi', cat: 'Antariksa', label: 'Pita Galaksi', text: 'Vast Milky Way galaxy band arching across the entire sky, dense star clusters, dark dust lanes, subtle warm glow at the galactic core, deep space panorama.' },
    { id: 'antariksa-planet', cat: 'Antariksa', label: 'Planet Cincin', text: 'Alien sky with a giant ringed gas planet rising near the horizon, two small moons, rich star field, deep violet and black gradient, cinematic sci-fi mood.' },
    { id: 'anime-siang', cat: 'Anime', label: 'Anime Siang', text: 'Anime style daytime sky, cel-shaded stylized cumulus clouds with crisp outlines, vivid saturated blue gradient, clean and cheerful, studio anime background art.' },
    { id: 'anime-senja', cat: 'Anime', label: 'Anime Senja', text: 'Anime style sunset sky, painterly gradient from orange to pink to violet, stylized flat clouds with warm rim light, nostalgic mood, anime background art.' },
    { id: 'horor-kabut', cat: 'Horor', label: 'Horor Berkabut', text: 'Horror atmosphere sky, oppressive grey-green overcast clouds, thick fog swallowing the horizon, faint dim light, desaturated and unsettling, subtle film grain.' },
    { id: 'horor-bulan-merah', cat: 'Horor', label: 'Bulan Darah', text: 'Ominous night sky with a blood-red moon, ragged black clouds slowly crossing, dark crimson glow at the horizon, deep black zenith, horror game mood.' }
  ];

  const CATS = ['Semua', 'Realistis', 'Cuaca', 'Fantasi', 'Antariksa', 'Anime', 'Horor'];

  function build(root) {
    const mk = (tag, props, parent) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (parent) parent.appendChild(e); return e; };

    // --- Cara pakai ---
    const guide = mk('div', { className: 'guide' }, root);
    mk('h4', { textContent: 'Cara pakai: AI gambar → konversi → Roblox' }, guide);
    const ol = mk('ol', {}, guide);
    ['Salin salah satu prompt di bawah (sudah termasuk aturan format panorama 2:1).',
     'Buka generator gambar AI favoritmu — Bing Image Creator, Midjourney, atau lainnya — lalu tempel dan generate.',
     'Unduh hasilnya (pilih resolusi terbesar), kembali ke tab ini, dan jatuhkan gambar itu ke area unggah. Rasio 2:1 otomatis dikenali sebagai panorama.',
     'Atur sambungan (Haluskan sambungan) kalau perlu, lalu ekspor atau upload ke Roblox seperti biasa.'].forEach(t => mk('li', { textContent: t }, ol));
    const negRow = mk('div', { className: 'row' }, guide);
    const btnNeg = mk('button', { type: 'button', textContent: 'Salin negative prompt' }, negRow);
    const negStatus = mk('span', { textContent: '', role: 'status', style: 'font-size:13px;color:var(--muted)' }, negRow);
    mk('p', { className: 'note', textContent: 'Negative prompt (untuk generator yang mendukung): ' + NEGATIVE }, guide);
    btnNeg.addEventListener('click', async () => {
      await copyText(NEGATIVE, negStatus, 'Negative prompt tersalin!');
    });

    // --- Filter kategori ---
    const chipRow = mk('div', { className: 'row', style: 'flex-wrap:wrap;gap:6px;margin:10px 0' }, root);
    let activeCat = 'Semua';
    const cards = [];
    CATS.forEach(cat => {
      const b = mk('button', { type: 'button', textContent: cat }, chipRow);
      b.addEventListener('click', () => { activeCat = cat; refresh(); });
      b.dataset.cat = cat;
    });

    // --- Daftar kartu prompt ---
    const list = mk('div', { style: 'display:grid;gap:10px;margin-top:6px' }, root);
    PROMPTS.forEach(p => {
      const card = mk('div', { style: 'border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--panel2)' }, list);
      const head = mk('div', { className: 'row', style: 'justify-content:space-between;margin:0 0 6px' }, card);
      mk('strong', { textContent: p.label + '  ', head });
      mk('span', { textContent: p.cat, style: 'font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 8px' }, head);
      const txt = mk('pre', { textContent: p.text + SUFFIX, style: 'white-space:pre-wrap;font-size:12.5px;margin:0 0 8px;color:var(--text)' }, card);
      const row = mk('div', { className: 'row' }, card);
      const btn = mk('button', { type: 'button', className: 'primary', textContent: 'Salin prompt' }, row);
      const st = mk('span', { textContent: '', role: 'status', style: 'font-size:13px;color:var(--muted)' }, row);
      btn.addEventListener('click', async () => { await copyText(txt.textContent, st, 'Tersalin! Tempel ke generator AI kamu.'); });
      cards.push({ cat: p.cat, card });
    });

    function refresh() {
      chipRow.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === activeCat)));
      cards.forEach(c => { c.card.hidden = activeCat !== 'Semua' && c.cat !== activeCat; });
    }
    refresh();
  }

  async function copyText(text, statusEl, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      if (statusEl) statusEl.textContent = okMsg || 'Tersalin!';
    } catch (_) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(statusEl.parentNode.querySelector('pre') || statusEl);
      sel.addRange(r);
      if (statusEl) statusEl.textContent = 'Clipboard ditolak. Teks dipilih, tekan Ctrl+C.';
    }
    if (statusEl) setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }

  return { build, SUFFIX, NEGATIVE, PROMPTS };
})();

"use strict";
// I18N: dua bahasa (id/en) untuk chrome utama. Elemen statis memakai atribut
// data-i18n (atau data-i18n-ph untuk placeholder); teks dinamis tetap bahasa
// Indonesia pada v1 (lihat catatan di toggle bahasa).
window.I18N = (function () {
  const KEY = 'naka.lang';
  const DICT = {
    id: {},
    en: {
      brandTag: 'Panorama 360\u00B0 into 6 Roblox skybox faces. 100% processed in your browser.',
      tabConvert: 'Convert', tabRoblox: 'Roblox', tabTools: 'Tools', tabPrompt: 'AI Prompt',
      btnZip: 'Download ZIP', btnCross: 'Download Cross',
      chkChar: 'Roblox Character', chkBaseplate: 'Baseplate', chkStudioMode: 'Studio Mode', chkWireframe: 'Wireframe Seam',
      emptyStrong: 'Start in 3 steps',
      step1: 'Drop an image (2:1 panorama or a normal photo \u2014 auto-converted), or try the sample skies below.',
      step2: 'Fine-tune if needed \u2014 color, position, and watermark live under Advanced Settings.',
      step3: 'Open the Roblox tab to upload 6 faces and install them into your game.',
      smpSiang: 'Try: Clear Day', smpSenja: 'Try: Sunset', smpMalam: 'Try: Starry Night',
      smpAurora: 'Try: Aurora', smpNebula: 'Try: Nebula', smpHoror: 'Try: Horror Fog',
      sumAdvanced: 'Advanced Settings', sumRes: 'Export Resolution',
      btnVariants: 'Make 4 Color Variants',
      secUpload: 'Upload image', secPreview: 'Result', secControls: 'Controls',
      navDashboard: 'Dashboard', navStudio: 'Skybox Studio',
      noteRes: '1024 is the safe default (Roblox downsizes textures to 1024). Choose 4096 for non-Roblox use like Blender \u2014 sharper before compression.'
    }
  };
  let cur = 'id';
  try { cur = localStorage.getItem(KEY) || 'id'; if (!DICT[cur]) cur = 'id'; } catch (e) {}

  function t(key) {
    const d = DICT[cur];
    return (d && d[key]) || DICT.id[key] || key;
  }
  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.documentElement.lang = cur === 'en' ? 'en' : 'id';
  }
  function setLang(l) {
    if (!DICT[l]) return;
    cur = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    apply();
    document.querySelectorAll('[data-lang-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.langBtn === cur)));
  }
  function init() {
    apply();
    document.querySelectorAll('[data-lang-btn]').forEach(b => {
      b.addEventListener('click', () => setLang(b.dataset.langBtn));
      b.setAttribute('aria-pressed', String(b.dataset.langBtn === cur));
    });
  }
  return { t, apply, setLang, init, lang: () => cur, keys: Object.keys(DICT.en) };
})();
document.addEventListener('DOMContentLoaded', () => { try { window.I18N.init(); } catch (e) {} });

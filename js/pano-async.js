"use strict";
// PanoAsync: menjalankan konversi 2D->panorama di Web Worker supaya UI tidak
// membeku selama proses (terutama 4096px). Fallback otomatis ke jalur sinkron
// bila browser tidak mendukung Worker/OffscreenCanvas/ImageBitmap.
window.PanoAsync = (function () {

  function supported() {
    return typeof Worker !== 'undefined' &&
           typeof createImageBitmap === 'function' &&
           typeof OffscreenCanvas !== 'undefined';
  }

  // Jalur worker: hasil { canvas, W, H }
  function viaWorker(src, sw, sh, o, smooth, smoothBand) {
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = new Worker('js/pano-worker.js'); }
      catch (e) { reject(e); return; }
      let settled = false;
      const finish = (fn, arg) => { if (!settled) { settled = true; worker.terminate(); fn(arg); } };
      worker.onerror = e => { finish(reject, new Error(e.message || 'Worker error')); };
      worker.onmessage = e => {
        const d = e.data;
        if (d.error) { finish(reject, new Error(d.error)); return; }
        const c = document.createElement('canvas');
        c.width = d.W; c.height = d.H;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.out), d.W, d.H), 0, 0);
        finish(resolve, c);
      };
      createImageBitmap(src).then(bitmap => {
        worker.postMessage({ bitmap, sw, sh, o, smooth, smoothBand }, [bitmap]);
      }).catch(err => finish(reject, err));
    });
  }

  // Jalur sinkron (fallback): hasil { canvas }
  function viaSync(src, sw, sh, o, smooth, smoothBand) {
    const c = window.Flat2Pano.convert(src, sw, sh, o);
    if (smooth > 0 && window.Flat2Pano.smoothPoles) {
      window.Flat2Pano.smoothPoles(c, smoothBand || 0.12, smooth / 100);
    }
    return Promise.resolve(c);
  }

  function convertAsync(src, sw, sh, o, smooth, smoothBand) {
    if (supported()) {
      return viaWorker(src, sw, sh, o, smooth, smoothBand)
        .catch(err => {
          console.warn('PanoAsync: worker gagal, memakai jalur sinkron —', err.message);
          return viaSync(src, sw, sh, o, smooth, smoothBand);
        });
    }
    return viaSync(src, sw, sh, o, smooth, smoothBand);
  }

  return { convertAsync, supported };
})();

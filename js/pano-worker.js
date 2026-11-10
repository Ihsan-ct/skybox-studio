// Worker konversi 2D -> panorama. Menjalankan flat2pano.js utuh dengan shim
// document berbasis OffscreenCanvas, sehingga seluruh logika tetap satu sumber.
// Pesan masuk : { bitmap (ImageBitmap, transferable), sw, sh, o }
// Pesan keluar: { out: ArrayBuffer (RGBA), W, H }
self.window = self;

self.document = {
  createElement(tag) {
    if (tag === 'canvas') return new OffscreenCanvas(1, 1);
    throw new Error('createElement("' + tag + '") tidak didukung di worker');
  }
};

importScripts('../js/flat2pano.js');

self.onmessage = async (e) => {
  const { bitmap, sw, sh, o, smooth, smoothBand } = e.data;
  try {
    let out = self.Flat2Pano.convert(bitmap, sw, sh, o);
    if (smooth > 0 && self.Flat2Pano.smoothPoles) {
      self.Flat2Pano.smoothPoles(out, smoothBand || 0.12, smooth / 100);
    }
    const g = out.getContext('2d');
    const id = g.getImageData(0, 0, out.width, out.height);
    self.postMessage({ out: id.data.buffer, W: out.width, H: out.height }, [id.data.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err && err.message || err) });
  }
};

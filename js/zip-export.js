"use strict";
window.ZipExport = (function () {
  const tick = () => new Promise(r => setTimeout(r, 16));

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return url;
  }

  async function renderFaceCanvas(face, size, state) {
    const GL = window.GLConvert;
    GL.setSize(size);
    GL.drawFace(face, size, state);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(GL.glCanvas, 0, 0);
    GL.applyWatermark(ctx, face.k, size, state);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob menghasilkan null')), 'image/png'));
  }

  async function exportOne(face, state, setStatus) {
    setStatus({ text: 'Merender ' + face.name + ' (' + state.exportRes + 'px)…' }); await tick();
    const blob = await renderFaceCanvas(face, state.exportRes, state);
    const fileName = 'Skybox' + face.k + '.png';
    const blobUrl = downloadBlob(blob, fileName);
    setStatus({
      text: 'Ekspor ' + fileName + ' selesai! Jika tidak otomatis mengunduh,',
      linkUrl: blobUrl,
      linkLabel: 'klik di sini untuk mengunduh manual.',
      download: fileName
    });
  }

  async function exportZip(state, setStatus) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip belum dimuat.');
    const GL = window.GLConvert;
    const zip = new JSZip();
    const t0 = performance.now();
    for (let i = 0; i < GL.FACES.length; i++) {
      const f = GL.FACES[i];
      setStatus({ text: 'Merender ' + f.name + ' (' + (i + 1) + '/6)…' }); await tick();
      const blob = await renderFaceCanvas(f, state.exportRes, state);
      zip.file('Skybox' + f.k + '.png', blob);
    }
    setStatus({ text: 'Menyusun berkas ZIP…' }); await tick();
    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const zipName = 'RobloxSkybox_' + state.exportRes + '.zip';
    const blobUrl = downloadBlob(content, zipName);
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus({
      text: `Ekspor ZIP selesai dalam ${sec}s! Jika tidak otomatis mengunduh,`,
      linkUrl: blobUrl,
      linkLabel: 'klik di sini untuk mengunduh manual.',
      download: zipName
    });
  }

  return { exportOne, exportZip };
})();
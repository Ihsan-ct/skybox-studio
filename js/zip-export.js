"use strict";
window.ZipExport = (function () {
  const tick = () => new Promise(r => setTimeout(r, 16));

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function renderFaceCanvas(face, size, state) {
    const GL = window.GLConvert;
    GL.setSize(size);
    GL.drawFace(face, size, state);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(GL.glCanvas, 0, 0);
    GL.applyWatermark(ctx, face.k, size, state);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  async function exportOne(face, state, setStatus) {
    setStatus('Merender ' + face.name + '…'); await tick();
    const blob = await renderFaceCanvas(face, state.exportRes, state);
    downloadBlob(blob, 'Skybox' + face.k + '.png');
    setStatus('');
  }

  async function exportZip(state, setStatus) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip belum dimuat.');
    const GL = window.GLConvert;
    const zip = new JSZip();
    for (let i = 0; i < GL.FACES.length; i++) {
      const f = GL.FACES[i];
      setStatus('Merender ' + f.name + ' (' + (i + 1) + '/6)…'); await tick();
      const blob = await renderFaceCanvas(f, state.exportRes, state);
      zip.file('Skybox' + f.k + '.png', blob);
    }
    setStatus('Menyusun berkas ZIP…'); await tick();
    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    downloadBlob(content, 'RobloxSkybox_' + state.exportRes + '.zip');
    setStatus('Ekspor ZIP selesai!');
  }

  return { exportOne, exportZip };
})();

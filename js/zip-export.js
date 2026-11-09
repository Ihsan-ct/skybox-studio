"use strict";
window.ZipExport = (function () {
  const tick = () => new Promise(r => setTimeout(r, 16));

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function exportOne(face, state, setStatus) {
    const GL = window.GLConvert;
    setStatus('Merender ' + face.name + '…'); await tick();
    GL.setSize(state.exportRes);
    GL.drawFace(face, state.exportRes, state);
    const blob = await GL.toBlob();
    downloadBlob(blob, 'Skybox' + face.k + '.png');
    setStatus('');
  }

  async function exportZip(state, setStatus) {
    if (typeof JSZip === 'undefined') {
      throw new Error('Library JSZip belum dimuat. Periksa koneksi internet Anda.');
    }
    const GL = window.GLConvert;
    const zip = new JSZip();
    for (let i = 0; i < GL.FACES.length; i++) {
      const f = GL.FACES[i];
      setStatus('Merender ' + f.name + ' (' + (i + 1) + '/6)…'); await tick();
      GL.setSize(state.exportRes);
      GL.drawFace(f, state.exportRes, state);
      const blob = await GL.toBlob();
      zip.file('Skybox' + f.k + '.png', blob);
    }
    setStatus('Menyusun berkas ZIP…'); await tick();
    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    downloadBlob(content, 'RobloxSkybox_' + state.exportRes + '.zip');
    setStatus('Ekspor ZIP selesai!');
  }

  return { exportOne, exportZip };
})();

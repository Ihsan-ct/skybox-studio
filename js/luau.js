"use strict";
window.LuauGen = (function () {
  const FACES = window.GLConvert.FACES;

  function buildLuau(ids, celestialShown) {
    const id = k => {
      const v = (ids[k] || '').replace(/\D/g, '');
      return 'rbxassetid://' + (v || 'GANTI_DENGAN_IMAGE_ID');
    };
    return [
      'local Lighting = game:GetService("Lighting")',
      'local sky = Lighting:FindFirstChildOfClass("Sky") or Instance.new("Sky")',
      'sky.Name = "Sky"',
      ...FACES.map(f => 'sky.Skybox' + f.k + ' = "' + id(f.k) + '"'),
      'sky.CelestialBodiesShown = ' + (celestialShown ? 'true' : 'false'),
      'sky.Parent = Lighting',
      ''
    ].join('\n');
  }

  return { buildLuau };
})();

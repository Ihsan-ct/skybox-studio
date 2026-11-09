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

  // File .rbxmx berisi satu objek Sky. Di Roblox Studio: klik kanan Lighting > Insert From File.
  function buildRbxmx(ids, celestialShown) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = k => 'rbxassetid://' + String(ids[k] || '').replace(/\D/g, '');
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<roblox version="4">',
      '  <Item class="Sky" referent="RBX0">',
      '    <Properties>',
      '      <string name="Name">Sky</string>',
      ...FACES.map(f => '      <Content name="Skybox' + f.k + '"><url>' + esc(url(f.k)) + '</url></Content>'),
      '      <bool name="CelestialBodiesShown">' + (celestialShown ? 'true' : 'false') + '</bool>',
      '    </Properties>',
      '  </Item>',
      '</roblox>',
      ''
    ].join('\n');
  }

  return { buildLuau, buildRbxmx };
})();

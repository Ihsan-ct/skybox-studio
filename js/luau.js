"use strict";
// ids dipetakan per nama PROPERTI Roblox (ids.Rt = Image ID untuk SkyboxRt, yang gambarnya
// dirender dari sisi kiri — konvensi Roblox, lihat catatan di gl-convert.js). Karena kunci
// FACES sama dengan nama properti, penugasan sky.Skybox<k> di bawah langsung benar.
window.LuauGen = (function () {
  const FACES = window.GLConvert.FACES;

  // Preset Atmosphere (kabut udara Roblox) — mengubah suasana langit secara instan.
  const ATM = {
    none: null,
    tipis: { Density: 0.22, Offset: 0.0, Glare: 0.1, Haze: 0.8 },
    normal: { Density: 0.34, Offset: 0.2, Glare: 0.25, Haze: 1.8 },
    tebal: { Density: 0.5, Offset: 0.4, Glare: 0.45, Haze: 3.4 }
  };
  const atmOf = p => ATM[p] || null;

  function buildLuau(ids, celestialShown, opts) {
    const id = k => {
      const v = (ids[k] || '').replace(/\D/g, '');
      return 'rbxassetid://' + (v || 'GANTI_DENGAN_IMAGE_ID');
    };
    const atm = atmOf(opts && opts.atmosphere);
    const atmLines = atm ? [
      'local atm = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")',
      'atm.Density = ' + atm.Density,
      'atm.Offset = ' + atm.Offset,
      'atm.Glare = ' + atm.Glare,
      'atm.Haze = ' + atm.Haze,
      'atm.Parent = Lighting'
    ] : [];
    return [
      'local Lighting = game:GetService("Lighting")',
      'local sky = Lighting:FindFirstChildOfClass("Sky") or Instance.new("Sky")',
      'sky.Name = "Sky"',
      ...FACES.map(f => 'sky.Skybox' + f.k + ' = "' + id(f.k) + '"'),
      'sky.CelestialBodiesShown = ' + (celestialShown ? 'true' : 'false'),
      'sky.Parent = Lighting',
      ...atmLines,
      ''
    ].join('\n');
  }

  function atmosphereXml(indent, preset) {
    const atm = atmOf(preset);
    if (!atm) return [];
    const pad = indent || '  ';
    return [
      pad + '<Item class="Atmosphere" referent="' + (arguments[2] || 'RBXA') + '">',
      pad + '  <Properties>',
      pad + '    <string name="Name">Atmosphere</string>',
      pad + '    <float name="Density">' + atm.Density + '</float>',
      pad + '    <float name="Offset">' + atm.Offset + '</float>',
      pad + '    <float name="Glare">' + atm.Glare + '</float>',
      pad + '    <float name="Haze">' + atm.Haze + '</float>',
      pad + '  </Properties>',
      pad + '</Item>'
    ];
  }

  // File .rbxmx berisi satu objek Sky. Di Roblox Studio: klik kanan Lighting > Insert From File.
  function buildRbxmx(ids, celestialShown, opts) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = k => 'rbxassetid://' + String(ids[k] || '').replace(/\D/g, '');
    const atmPreset = opts && opts.atmosphere;
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<roblox version="4">',
      '  <Item class="Sky" referent="RBX0">',
      '    <Properties>',
      '      <string name="Name">Sky</string>',
      ...FACES.map(f => '      <Content name="Skybox' + f.k + '"><url>' + esc(url(f.k)) + '</url></Content>'),
      '      <bool name="CelestialBodiesShown">' + (celestialShown ? 'true' : 'false') + '</bool>',
      '      <int name="StarCount">3000</int>',
      '      <float name="SunAngularSize">21</float>',
      '      <float name="MoonAngularSize">11</float>',
      '    </Properties>',
      '  </Item>',
      ...atmosphereXml('  ', atmPreset, 'RBXA'),
      '</roblox>',
      ''
    ].join('\n');
  }

  function skyItemXml(entry, referent) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = k => 'rbxassetid://' + String((entry.ids && entry.ids[k]) || '').replace(/\D/g, '');
    const nm = String(entry.name || 'Sky').replace(/[^\w\- ]/g, '').slice(0, 40) || 'Sky';
    return [
      '    <Item class="Sky" referent="' + referent + '">',
      '      <Properties>',
      '        <string name="Name">' + esc(nm) + '</string>',
      ...FACES.map(f => '        <Content name="Skybox' + f.k + '"><url>' + esc(url(f.k)) + '</url></Content>'),
      '        <bool name="CelestialBodiesShown">true</bool>',
      '        <int name="StarCount">3000</int>',
      '        <float name="SunAngularSize">21</float>',
      '        <float name="MoonAngularSize">11</float>',
      '      </Properties>',
      '    </Item>'
    ].join('\n');
  }

  // Paket ganti-langit: satu .rbxmx berisi folder "SkyboxSets" dengan satu Sky per entri
  // (dari riwayat upload). Dipasangkan dengan buildSkySwitcherLua untuk memindah-pindah
  // langit dari dalam game.
  function buildSkyPackRbxmx(entries) {
    const list = (entries || []).filter(e => e && e.ids);
    const body = [];
    body.push('<?xml version="1.0" encoding="utf-8"?>');
    body.push('<roblox version="4">');
    body.push('  <Item class="Folder" referent="RBXF0">');
    body.push('    <Properties>');
    body.push('      <string name="Name">SkyboxSets</string>');
    body.push('    </Properties>');
    list.forEach((e, i) => body.push(skyItemXml(e, 'RBX' + (i + 1))));
    body.push('  </Item>');
    body.push('</roblox>');
    body.push('');
    return body.join('\n');
  }

  // Script ganti-langit (Script di ServerScriptService). SETS berisi daftar ID per
  // skybox; applySky(name) memasang langit pilihan dengan membuang Sky aktif sebelumnya.
  function buildSkySwitcherLua(entries) {
    const list = (entries || []).filter(e => e && e.ids);
    const sets = list.map(e => {
      const nm = String(e.name || 'Sky').replace(/[^\w\- ]/g, '').trim() || 'Sky';
      const row = FACES.map(f => f.k + ' = "' + (String(e.ids[f.k] || '').replace(/\D/g, '') || '0') + '"');
      return '  ["' + nm + '"] = { ' + row.join(', ') + ' }';
    });
    const first = list.length ? ('applySky("' + String(list[0].name || 'Sky').replace(/[^\w\- ]/g, '').trim() + '")') : '';
    return [
      '-- Skybox Switcher (Roblox Skybox Studio)',
      '-- Pasang: buat Script di ServerScriptService, tempel kode ini.',
      '-- Folder "SkyboxSets" dari file paket .rbxmx tidak wajib diimpor; SETS di bawah',
      '-- sudah memuat semua ID. Ganti langit: applySky("<nama>") dari script mana pun',
      '-- (mis. lewat RemoteEvent atau ProximityPrompt).',
      'local Lighting = game:GetService("Lighting")',
      '',
      'local SETS = {',
      ...sets,
      '}',
      '',
      'local current',
      'local function applySky(name)',
      '\tlocal set = SETS[name]',
      '\tif not set then warn("Skybox set tidak dikenal: " .. tostring(name)) return false end',
      '\tif current then current:Destroy() end',
      '\tlocal sky = Instance.new("Sky")',
      '\tsky.Name = "Sky"',
      '\tfor k, v in pairs(set) do',
      '\t\tsky["Skybox" .. k] = "rbxassetid://" .. v',
      '\tend',
      '\tsky.CelestialBodiesShown = true',
      '\tsky.Parent = Lighting',
      '\tcurrent = sky',
      '\treturn true',
      'end',
      '',
      '_G.ApplySky = applySky',
      '',
      '-- Langit awal:',
      first,
      ''
    ].join('\n');
  }

  return { buildLuau, buildRbxmx, buildSkyPackRbxmx, buildSkySwitcherLua };
})();

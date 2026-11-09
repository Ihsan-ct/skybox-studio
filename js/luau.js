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
  // Profil pencahayaan ala "skybox + lighting": mood langit menentukan setelan
  // Lighting Roblox + efek pendukung, bukan cuma dekorasi.
  const LIGHTING = {
    auto: null,
    siang: { ClockTime: 14, Brightness: 3, Ambient: [140, 150, 165], OutdoorAmbient: [150, 168, 200], ExposureCompensation: 0.1, fog: [170, 205, 245], fogEnd: 900, bloom: [0.4, 0.55, 0.95], cc: [0.98, 1.0, 1.06, 0] },
    senja: { ClockTime: 17.6, Brightness: 2.2, Ambient: [128, 108, 122], OutdoorAmbient: [172, 122, 110], ExposureCompensation: 0.15, fog: [232, 148, 110], fogEnd: 700, bloom: [0.55, 0.6, 0.9], cc: [1.06, 0.98, 1.02, 0.03] },
    malam: { ClockTime: 0, Brightness: 1.2, Ambient: [38, 44, 62], OutdoorAmbient: [48, 58, 92], ExposureCompensation: 0.2, fog: [22, 34, 62], fogEnd: 520, bloom: [0.7, 0.55, 0.8], cc: [0.88, 0.94, 1.12, 0.02] },
    horor: { ClockTime: 5.8, Brightness: 1, Ambient: [42, 50, 44], OutdoorAmbient: [58, 72, 60], ExposureCompensation: -0.1, fog: [56, 70, 58], fogEnd: 260, bloom: [0.25, 0.4, 0.7], cc: [0.92, 1.04, 0.9, 0.06] }
  };
  const lightingOf = p => LIGHTING[p] || null;

  function buildLuau(ids, celestialShown, opts) {
    const id = k => {
      const v = (ids[k] || '').replace(/\D/g, '');
      return 'rbxassetid://' + (v || 'GANTI_DENGAN_IMAGE_ID');
    };
    const atmLines = atmosphereLuau(opts && opts.atmosphere);
    const lightLines = lightingLuau(opts && opts.lighting);
    return [
      'local Lighting = game:GetService("Lighting")',
      'local sky = Lighting:FindFirstChildOfClass("Sky") or Instance.new("Sky")',
      'sky.Name = "Sky"',
      ...FACES.map(f => 'sky.Skybox' + f.k + ' = "' + id(f.k) + '"'),
      'sky.CelestialBodiesShown = ' + (celestialShown ? 'true' : 'false'),
      'sky.Parent = Lighting',
      ...atmLines,
      ...lightLines,
      ''
    ].join('\n');
  }

  function atmosphereLuau(preset) {
    const atm = atmOf(preset);
    if (!atm) return [];
    return [
      'local atm = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")',
      'atm.Density = ' + atm.Density,
      'atm.Offset = ' + atm.Offset,
      'atm.Glare = ' + atm.Glare,
      'atm.Haze = ' + atm.Haze,
      'atm.Parent = Lighting'
    ];
  }

  function lightingLuau(profile) {
    const L = lightingOf(profile);
    if (!L) return [];
    const rgb = a => 'Color3.fromRGB(' + a[0] + ', ' + a[1] + ', ' + a[2] + ')';
    return [
      '-- Profil pencahayaan NAKA (mood: ' + profile + ')',
      'Lighting.ClockTime = ' + L.ClockTime,
      'Lighting.Brightness = ' + L.Brightness,
      'Lighting.Ambient = ' + rgb(L.Ambient),
      'Lighting.OutdoorAmbient = ' + rgb(L.OutdoorAmbient),
      'Lighting.ExposureCompensation = ' + L.ExposureCompensation,
      'Lighting.FogColor = ' + rgb(L.fog),
      'Lighting.FogEnd = ' + L.fogEnd,
      'local bloom = Lighting:FindFirstChildOfClass("BloomEffect") or Instance.new("BloomEffect")',
      'bloom.Intensity = ' + L.bloom[0],
      'bloom.Size = ' + L.bloom[1],
      'bloom.Threshold = ' + L.bloom[2],
      'bloom.Parent = Lighting',
      'local cc = Lighting:FindFirstChildOfClass("ColorCorrectionEffect") or Instance.new("ColorCorrectionEffect")',
      'cc.Brightness = ' + L.cc[0],
      'cc.Contrast = ' + L.cc[1],
      'cc.Saturation = ' + L.cc[2],
      'cc.TintColor = ' + rgb([Math.round(L.cc[3] * 255), Math.round((1 - L.cc[3]) * 255), 200]),
      'cc.Parent = Lighting'
    ];
  }

  function atmosphereXml(indent, preset, refBase) {
    const atm = atmOf(preset);
    if (!atm) return [];
    const pad = indent || '  ';
    return [
      pad + '<Item class="Atmosphere" referent="' + (refBase || 'RBXA') + '">',
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

  function lightingXml(indent, profile, refBase) {
    const L = lightingOf(profile);
    if (!L) return [];
    const pad = indent || '  ';
    const rgbx = a => (a[0] / 255) + ' ' + (a[1] / 255) + ' ' + (a[2] / 255);
    const tintc = [Math.round(L.cc[3] * 255), Math.round((1 - L.cc[3]) * 255), 200];
    return [
      pad + '<Item class="BloomEffect" referent="' + refBase + 'B">',
      pad + '  <Properties>',
      pad + '    <string name="Name">NAKA Bloom</string>',
      pad + '    <float name="Intensity">' + L.bloom[0] + '</float>',
      pad + '    <float name="Size">' + L.bloom[1] + '</float>',
      pad + '    <float name="Threshold">' + L.bloom[2] + '</float>',
      pad + '  </Properties>',
      pad + '</Item>',
      pad + '<Item class="ColorCorrectionEffect" referent="' + refBase + 'C">',
      pad + '  <Properties>',
      pad + '    <string name="Name">NAKA Color</string>',
      pad + '    <float name="Brightness">' + L.cc[0] + '</float>',
      pad + '    <float name="Contrast">' + L.cc[1] + '</float>',
      pad + '    <float name="Saturation">' + L.cc[2] + '</float>',
      pad + '    <Color3uint8 name="TintColor">' + tintc.join(' ') + '</Color3uint8>',
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
      ...lightingXml('  ', opts && opts.lighting, 'RBXL'),
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

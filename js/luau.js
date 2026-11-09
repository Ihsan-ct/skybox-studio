"use strict";
// ids dipetakan per nama PROPERTI Roblox (ids.Rt = Image ID untuk SkyboxRt, yang gambarnya
// dirender dari sisi kiri — konvensi Roblox, lihat catatan di gl-convert.js). Karena kunci
// FACES sama dengan nama properti, penugasan sky.Skybox<k> di bawah langsung benar.
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
      '      <int name="StarCount">3000</int>',
      '      <float name="SunAngularSize">21</float>',
      '      <float name="MoonAngularSize">11</float>',
      '    </Properties>',
      '  </Item>',
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

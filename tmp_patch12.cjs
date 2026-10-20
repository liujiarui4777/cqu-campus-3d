const fs=require('fs');
let b=fs.readFileSync('src/build.js','utf8');
b=b.replace("    // 嘉陵江也画成贴地水面（3km 底图范围内）","    if (a.kind === 'river') continue;");
b=b.replace("    if (a.kind === 'water' || a.kind === 'river') water.push(inst);","    if (a.kind === 'water') water.push(inst);");
b += `

/* 嘉陵江：用固定水面高程的多边形，避免贴地后被岸边地形切碎 */
export function addRiver(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const rivers = (data.areas || []).filter((a) => a.kind === 'river');
  if (!rivers.length) return;
  for (const r of rivers) {
    let minH = Infinity;
    for (const [lon, lat] of r.outline) minH = Math.min(minH, terrain.sample(lon, lat));
    if (!isFinite(minH)) minH = 170;
    const flat = [];
    for (const [lon, lat] of r.outline) flat.push(lon, lat);
    viewer.entities.add({
      id: 'river:' + r.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
        height: minH + 2.5,
        material: Cesium.Color.fromCssColorString('#a5c8d8').withAlpha(0.94),
      },
      properties: { kind: 'river', name: '嘉陵江' },
    });
  }
}
`;
fs.writeFileSync('src/build.js', b);

let s=fs.readFileSync('src/app.js','utf8');
s=s.replace("import { addAreas, addRoads, addBuildings, addBoundary } from './build.js';","import { addAreas, addRoads, addBuildings, addBoundary, addRiver } from './build.js';");
s=s.replace("    if (!only || only === 'areas') addAreas(viewer, data, terrain);","    if (!only || only === 'areas') addAreas(viewer, data, terrain);\n    if (!only || only === 'river') addRiver(viewer, data, terrain);");
fs.writeFileSync('src/app.js', s);
console.log('ok');

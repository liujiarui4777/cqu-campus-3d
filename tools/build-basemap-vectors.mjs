// 合并 10 km 范围的 OSM 矢量，供底图烘焙（不进入 3D 场景）
// 输入：data/raw/10km-<quad>.json
// 输出：data/basemap-vectors.json
// 用法：node tools/build-basemap-vectors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'basemap-vectors.json');

const QUADS = ['sw', 'se', 'nw', 'ne'];
const seen = new Set();
const roads = [];
const areas = [];

const lanesDefault = {
  motorway: 4, trunk: 4, primary: 4, secondary: 2, tertiary: 2,
  motorway_link: 2, trunk_link: 2, primary_link: 2, secondary_link: 2, tertiary_link: 2,
  residential: 2, unclassified: 2, service: 1,
};

function areaKind(t) {
  if (t.natural === 'water' || t.waterway === 'riverbank') {
    return t.water === 'river' || t.name === '嘉陵江' ? 'river' : 'water';
  }
  if (t.leisure === 'pitch' || t.leisure === 'stadium') return t.sport === 'soccer' ? 'pitch' : 'pitch';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'forest'
    || t.landuse === 'recreation_ground' || t.landuse === 'meadow' || t.landuse === 'farmland') return 'green';
  if (t.landuse === 'cemetery') return 'green';
  if (t.landuse === 'residential' || t.landuse === 'commercial' || t.landuse === 'retail'
    || t.landuse === 'industrial' || t.landuse === 'construction') return 'urban';
  if (t.landuse === 'education') return 'campus';
  return null;
}

for (const q of QUADS) {
  const file = path.join(RAW, `10km-${q}.json`);
  if (!fs.existsSync(file)) {
    console.log('缺少', q, '（跳过）');
    continue;
  }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const el of j.elements || []) {
    if (seen.has(el.id)) continue;
    seen.add(el.id);
    const t = el.tags || {};
    const geom = el.geometry || [];
    if (geom.length < 2) continue;
    const path6 = geom.map((p) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);

    if (t.highway) {
      if (!lanesDefault[t.highway]) continue;
      const lanes = t.lanes !== undefined ? Number(t.lanes) : lanesDefault[t.highway];
      const width = Number(t.width) || (lanes > 0 ? lanes * 3.25 + 1.0 : 5);
      roads.push({
        cls: t.highway,
        lanes,
        width: Math.round(width * 10) / 10,
        bridge: !!t.bridge,
        tunnel: !!t.tunnel,
        path: path6,
      });
    } else {
      const kind = areaKind(t);
      if (!kind || geom.length < 3) continue;
      // 去掉闭合 way 的重复末点
      if (path6.length > 3 && path6[0][0] === path6[path6.length - 1][0] && path6[0][1] === path6[path6.length - 1][1]) {
        path6.pop();
      }
      areas.push({ kind, name: t.name || '', outline: path6 });
    }
  }
}

const out = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    bounds: { west: 106.4099, south: 29.5243, east: 106.5131, north: 29.6147, sizeKm: 10 },
    source: 'OpenStreetMap (ODbL)',
    quads: QUADS,
  },
  roads,
  areas,
};
fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
const byKind = {};
for (const a of areas) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
console.log('roads', roads.length, '| areas', areas.length, JSON.stringify(byKind));
console.log('written', OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + 'MB');

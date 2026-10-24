// 生成虎溪底图用的「周边矢量」与「白模屋面」：
//   data/hx/basemap-vectors.json —— 校区外的道路/水系/绿地（让底图有城市肌理）
//   data/hx/surroundings.json    —— 校区外建筑轮廓（浅灰白模块）
// 用法：node tools/build-hx-vectors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'hx');

const readEls = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).elements;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

function pointInPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const centroid = (pts) => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

const campusRaw = readEls('hx-campus.json');
const hx = campusRaw.find((e) => (e.tags?.name || '').replace(/\s+/g, '') === '重庆大学虎溪校区');
const ring = (hx.geometry || []).map((p) => [p.lon, p.lat]);
const inHx = (lon, lat) => pointInPoly(lon, lat, ring);

// 底图只覆盖地形范围，略微外扩
const BBOX = { west: 106.2790, south: 29.5810, east: 106.3078, north: 29.6060 };
const inBox = (lon, lat) =>
  lon > BBOX.west && lon < BBOX.east && lat > BBOX.south && lat < BBOX.north;

// ---- 校区外道路 ----
const roads = [];
const seen = new Set();
for (const el of readEls('hx-roads.json')) {
  const t = el.tags || {};
  if (!t.highway || seen.has(el.id)) continue;
  if (t.highway === 'proposed' || t.highway === 'construction' || t.highway === 'raceway') continue;
  const pts = (el.geometry || []).map((p) => [p.lon, p.lat]);
  if (pts.length < 2) continue;
  const c = centroid(pts);
  if (inHx(c[0], c[1])) continue; // 校内道路由 scene.json 精细绘制
  if (!inBox(c[0], c[1])) continue;
  seen.add(el.id);
  const lanes = Number(t.lanes) || ({ primary: 4, secondary: 2, tertiary: 2, residential: 2 }[t.highway] ?? 1);
  roads.push({
    cls: t.highway,
    width: Math.round((Number(t.width) || (lanes > 0 ? lanes * 3.25 + 1 : 2.4)) * 10) / 10,
    path: pts.map(([lon, lat]) => [r6(lon), r6(lat)]),
  });
}

// ---- 校区外场地 ----
const areas = [];
for (const el of readEls('hx-areas.json')) {
  const t = el.tags || {};
  let kind = null;
  if (t.natural === 'water' || t.waterway === 'riverbank') kind = 'water';
  else if (t.leisure === 'pitch' || t.leisure === 'stadium') kind = 'pitch';
  else if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'forest') kind = 'green';
  if (!kind) continue;

  const rings = [];
  if (el.type === 'relation') {
    for (const m of el.members || []) {
      if (m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length >= 4) {
        rings.push(m.geometry.map((p) => [p.lon, p.lat]));
      }
    }
  } else if (el.geometry && el.geometry.length >= 4) {
    rings.push(el.geometry.map((p) => [p.lon, p.lat]));
  }
  for (const raw of rings) {
    const r = raw.slice();
    if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    if (r.length < 3) continue;
    const c = centroid(r);
    if (inHx(c[0], c[1]) || !inBox(c[0], c[1])) continue;
    areas.push({ kind, outline: r.map(([lon, lat]) => [r6(lon), r6(lat)]) });
  }
}

// ---- 校区外建筑白模 ----
const items = [];
for (const el of readEls('hx-buildings.json')) {
  const g = el.geometry || [];
  if (g.length < 3) continue;
  const pts = g.map((p) => [p.lon, p.lat]);
  const c = centroid(pts);
  if (inHx(c[0], c[1]) || !inBox(c[0], c[1])) continue;
  items.push({ outline: pts.map(([lon, lat]) => [r6(lon), r6(lat)]) });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'basemap-vectors.json'), JSON.stringify({ areas, roads }), 'utf8');
fs.writeFileSync(path.join(OUT, 'surroundings.json'), JSON.stringify({ items }), 'utf8');
console.log('周边道路', roads.length, '| 周边场地', areas.length, '| 周边白模', items.length);

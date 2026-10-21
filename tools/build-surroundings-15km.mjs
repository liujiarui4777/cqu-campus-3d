// 非重庆大学建筑白模（15 km 范围）：保留 OSM 真实轮廓，前端挤出成白模
// 排除 A/B/C 区边界内及边界外 90 m 内的建筑
// 用法：node tools/build-surroundings-15km.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const DATA = path.join(ROOT, 'data');

const scene = JSON.parse(fs.readFileSync(path.join(DATA, 'scene.json'), 'utf8'));
const boundaries = scene.boundaries || [];
const fine = scene.buildings || [];

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

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

function distToBoundary(lon, lat, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0];
    const ay = poly[j][1];
    const bx = poly[i][0];
    const by = poly[i][1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy || 1)));
    const px = ax + dx * t;
    const py = ay + dy * t;
    best = Math.min(best, Math.hypot((lon - px) * mLon(lat), (lat - py) * MLAT));
  }
  return best;
}

const fineBoxes = fine.map((b) => {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of b.outline || []) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const padLon = 4 / mLon(b.center[1] || 29.57);
  const padLat = 4 / MLAT;
  return { minLon: minLon - padLon, maxLon: maxLon + padLon, minLat: minLat - padLat, maxLat: maxLat + padLat };
});
const overlaps = (a, b) =>
  !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);

const LEVEL_H = 3.1;
const TYPE_LEVELS = {
  apartments: 8, residential: 7, dormitory: 6, commercial: 4, retail: 3, office: 6,
  school: 3, university: 4, kindergarten: 2, house: 2, detached: 2, terrace: 2,
  industrial: 2, warehouse: 2, garage: 1, church: 6, hospital: 6, hotel: 8,
};

// 轮廓抽稀：保留首尾 + 等距采样，控制数据体积（轮廓形状仍清晰）
function simplify(outline, maxPts = 24) {
  if (outline.length <= maxPts) return outline;
  const step = outline.length / maxPts;
  const out = [];
  for (let i = 0; i < maxPts; i++) out.push(outline[Math.floor(i * step)]);
  return out;
}

const out = [];
const seen = new Set();
let skippedCampus = 0;
let skippedSize = 0;
const files = fs
  .readdirSync(RAW)
  .filter((f) => /^15km-\d+\.json$/.test(f))
  .sort();

for (const file of files) {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  for (const el of j.elements || []) {
    const t = el.tags || {};
    if (!t.building) continue;
    if (seen.has(el.id)) continue;
    seen.add(el.id);
    const g = el.geometry || [];
    if (g.length < 3) continue;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of g) {
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
    }
    const cx = (minLon + maxLon) / 2;
    const cy = (minLat + maxLat) / 2;
    const w = (maxLon - minLon) * mLon(cy);
    const d = (maxLat - minLat) * MLAT;
    if (w < 6 || d < 6 || w > 140 || d > 140 || w * d < 36) {
      skippedSize++;
      continue;
    }

    let nearCampus = false;
    for (const b of boundaries) {
      if (pointInPoly(cx, cy, b.coords) || distToBoundary(cx, cy, b.coords) < 90) {
        nearCampus = true;
        break;
      }
    }
    if (nearCampus) {
      skippedCampus++;
      continue;
    }
    const box = { minLon, maxLon, minLat, maxLat };
    if (fineBoxes.some((b) => overlaps(box, b))) {
      skippedCampus++;
      continue;
    }

    let h;
    const tagH = Number(t.height);
    const lv = Number(t['building:levels']);
    if (tagH > 0) h = tagH;
    else if (lv > 0) h = lv * LEVEL_H;
    else {
      let n = TYPE_LEVELS[t.building] || 3;
      // OSM 缺层数时，大占地建筑（厂房/商场/综合体）按面积抬高，避免“大平房”穿模感
      const footprint = w * d;
      if (footprint > 3000) n = Math.max(n, 4);
      if (footprint > 8000) n = Math.max(n, 6);
      if (footprint > 20000) n = Math.max(n, 8);
      h = n * LEVEL_H;
    }
    h = Math.min(140, Math.max(6, h));

    let outline = g.map((p) => [Math.round(p.lon * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7]);
    if (outline.length > 3 && outline[0][0] === outline[outline.length - 1][0] && outline[0][1] === outline[outline.length - 1][1]) {
      outline.pop();
    }
    outline = simplify(outline, 24);
    if (outline.length < 3) continue;

    out.push({ h: Math.round(h * 10) / 10, tone: el.id % 3, lon: Math.round(cx * 1e7) / 1e7, lat: Math.round(cy * 1e7) / 1e7, w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10 });
  }
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  count: out.length,
  source: 'OpenStreetMap (ODbL)',
  scopeKm: 15,
  note: '非重庆大学建筑白模（15 km 范围，真实轮廓挤出，A/B/C 区已排除）',
  items: out,
};
fs.writeFileSync(path.join(DATA, 'surroundings.json'), JSON.stringify(payload), 'utf8');
console.log('白模', out.length, '栋 | 跳过校园/重叠', skippedCampus, '| 尺寸异常', skippedSize);
console.log('written', path.join(DATA, 'surroundings.json'), (fs.statSync(path.join(DATA, 'surroundings.json')).size / 1024).toFixed(0) + 'KB');




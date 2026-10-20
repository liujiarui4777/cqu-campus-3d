// 非重庆大学建筑白模：10 km 范围内 OSM 建筑 → bbox 白模（数据量小、实例化渲染快）
// 排除 A/B 区边界内及边界外 90 m 内的建筑（这些由精心建模的校园建筑呈现）
// 用法：node tools/build-surroundings-10km.mjs
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

// 校园精细建筑的包围盒（缓冲 4 m）
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
function overlaps(a, b) {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

const LEVEL_H = 3.1;
const TYPE_LEVELS = {
  apartments: 8, residential: 7, dormitory: 6, commercial: 4, retail: 3, office: 6,
  school: 3, university: 4, kindergarten: 2, house: 2, detached: 2, terrace: 2,
  industrial: 2, warehouse: 2, garage: 1, church: 6, hospital: 6, hotel: 8,
};

const Q = ['sw', 'se', 'nw', 'ne'];
const out = [];
const seen = new Set();
let skippedCampus = 0;
let skippedSize = 0;

for (const q of Q) {
  const file = path.join(RAW, `10km-bld-${q}.json`);
  if (!fs.existsSync(file)) {
    console.log('缺少', q, '（跳过）');
    continue;
  }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const el of j.elements || []) {
    if (seen.has(el.id)) continue;
    seen.add(el.id);
    const g = el.geometry || [];
    if (g.length < 3) continue;
    const t = el.tags || {};
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
    if (w < 6 || d < 6 || w > 260 || d > 260) {
      skippedSize++;
      continue;
    }
    if (w * d < 36) {
      skippedSize++;
      continue;
    }

    // 校园内 / 边界 90 m 内 / 与精细建筑重叠 → 跳过
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
      const n = TYPE_LEVELS[t.building] || 3;
      h = n * LEVEL_H;
    }
    h = Math.min(120, Math.max(4, h));

    out.push({
      lon: Math.round(cx * 1e7) / 1e7,
      lat: Math.round(cy * 1e7) / 1e7,
      w: Math.round(w * 10) / 10,
      d: Math.round(d * 10) / 10,
      h: Math.round(h * 10) / 10,
      // 0 = 白模，1 = 略暖白，供前端做极轻微明暗差
      tone: (el.id + (t.building || '').length) % 3,
    });
  }
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  count: out.length,
  source: 'OpenStreetMap (ODbL)',
  note: '非重庆大学建筑白模（10 km 范围，A/B 区已排除）',
  items: out,
};
fs.writeFileSync(path.join(DATA, 'surroundings.json'), JSON.stringify(payload), 'utf8');
console.log('白模', out.length, '栋 | 跳过校园/重叠', skippedCampus, '| 尺寸异常', skippedSize);
console.log('written', path.join(DATA, 'surroundings.json'), (fs.statSync(path.join(DATA, 'surroundings.json')).size / 1024).toFixed(0) + 'KB');

// 校园周边建筑：极简处理（bbox 方块 + 单色），作为城市肌理
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('data/raw/osm-surroundings.json', 'utf8')).elements;
const scene = JSON.parse(fs.readFileSync('data/scene.json', 'utf8'));

const MLAT = 110540;
const MLON = 111320 * Math.cos((29.567 * Math.PI) / 180);

// A 区已有建筑的包围盒，用于排除重叠（防止周边方块插进校园）
const campusBoxes = scene.buildings.map((b) => {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of b.outline || []) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return { minLon, maxLon, minLat, maxLat };
});
function overlaps(a, b) {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}
const campus = scene.buildings.map((b) => b.center);

// A 区边界（用于排除校园内及贴边的建筑）
const boundary = scene.boundary || [];
function pointInPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToBoundary(lon, lat, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], ay = poly[j][1];
    const bx = poly[i][0], by = poly[i][1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy || 1)));
    const px = ax + dx * t, py = ay + dy * t;
    const d = Math.hypot((lon - px) * MLON, (lat - py) * MLAT);
    best = Math.min(best, d);
  }
  return best;
}

const out = [];
for (const el of raw) {
  const t = el.tags || {};
  const geom = el.geometry || [];
  if (geom.length < 3) continue;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const g of geom) {
    minLon = Math.min(minLon, g.lon);
    maxLon = Math.max(maxLon, g.lon);
    minLat = Math.min(minLat, g.lat);
    maxLat = Math.max(maxLat, g.lat);
  }
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;

  // 在校园边界内、或距边界不足 70m 的，一律跳过（不再往校园里塞方块）
  if (boundary.length > 3 && (pointInPoly(cx, cy, boundary) || distToBoundary(cx, cy, boundary) < 70)) continue;

  const w = (maxLon - minLon) * MLON;
  const d = (maxLat - minLat) * MLAT;
  if (w < 4 || d < 4 || w > 220 || d > 220) continue;

  const levels = Number(t['building:levels']) || (t.building === 'apartments' || t.building === 'residential' ? 8 : t.building === 'commercial' ? 4 : 3);
  const h = Math.min(90, Math.max(3.5, levels * 3.1));

  // 类型颜色
  let color = '#cfd3d7';
  if (['apartments', 'residential', 'dormitory'].includes(t.building)) color = '#d9d2c4';
  else if (['commercial', 'retail', 'office'].includes(t.building)) color = '#c9cdd4';
  else if (['school', 'university', 'kindergarten'].includes(t.building)) color = '#d8d5cc';
  else if (['industrial', 'warehouse'].includes(t.building)) color = '#c2c6c9';

  out.push({
    lon: Math.round(cx * 1e7) / 1e7,
    lat: Math.round(cy * 1e7) / 1e7,
    w: Math.round(w * 10) / 10,
    d: Math.round(d * 10) / 10,
    h: Math.round(h * 10) / 10,
    color,
  });
}

fs.writeFileSync('data/surroundings.json', JSON.stringify({ count: out.length, items: out }));
console.log('surroundings:', out.length);

// 校园周边建筑：极简处理（bbox 方块 + 单色），作为城市肌理
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('data/raw/osm-surroundings.json', 'utf8')).elements;
const scene = JSON.parse(fs.readFileSync('data/scene.json', 'utf8'));

const MLAT = 110540;
const MLON = 111320 * Math.cos((29.567 * Math.PI) / 180);

// A 区已有建筑的中心点，用于去重
const campus = scene.buildings.map((b) => b.center);

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

  // 与 A 区建筑太近的跳过（避免和精细建筑重叠）
  let tooClose = false;
  for (const [lon, lat] of campus) {
    if (Math.abs(lon - cx) < 0.0005 && Math.abs(lat - cy) < 0.0005) {
      tooClose = true;
      break;
    }
  }
  if (tooClose) continue;

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

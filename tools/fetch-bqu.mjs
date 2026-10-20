// 下载重庆大学 B 区（原重庆建筑大学）的建筑/道路/水域绿地/边界
// 用法：node tools/fetch-bqu.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

// B 区范围（含边界外 80m，便于筛选）
const BBOX = { west: 106.4493, south: 29.5658, east: 106.4608, north: 29.5738 };

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpass(q, label, outFile) {
  for (const u of SERVERS) {
    try {
      const t0 = Date.now();
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cqu-campus-3d/0.4 (student project)' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(180000),
      });
      const txt = await r.text();
      console.log(label, u, r.status, (txt.length / 1024).toFixed(0) + 'KB', Date.now() - t0 + 'ms');
      if (!r.ok) continue;
      const j = JSON.parse(txt);
      if (!j.elements) continue;
      fs.writeFileSync(path.join(RAW, outFile), txt);
      console.log('  saved', outFile, 'elements', j.elements.length);
      return j.elements;
    } catch (e) {
      console.log(label, u, 'ERR', e.message);
    }
  }
  throw new Error(label + ' 全部服务器失败');
}

const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

// 1) B 区边界（relation 8253635）
const rel = await overpass(`[out:json][timeout:120];relation(8253635);out geom;`, 'B区边界', 'osm-bqu-relation.json');
// 2) B 区建筑（bbox 内全部 building）
const blds = await overpass(
  `[out:json][timeout:180];way["building"](${bb});out geom;`,
  'B区建筑',
  'osm-bqu-buildings.json',
);
// 3) B 区道路（含步道/台阶）
const roads = await overpass(
  `[out:json][timeout:180];way["highway"](${bb});out geom;`,
  'B区道路',
  'osm-bqu-roads.json',
);
// 4) B 区水域/绿地/球场/河流
const areas = await overpass(
  `[out:json][timeout:180];
(
  way["natural"="water"](${bb});
  way["waterway"="riverbank"](${bb});
  way["leisure"="pitch"](${bb});
  way["leisure"="garden"](${bb});
  way["leisure"="park"](${bb});
  way["landuse"="grass"](${bb});
  way["landuse"="forest"](${bb});
  way["landuse"="recreation_ground"](${bb});
);
out geom;`,
  'B区场地',
  'osm-bqu-areas.json',
);

console.log('B区: 建筑', blds.length, '道路', roads.length, '场地', areas.length);

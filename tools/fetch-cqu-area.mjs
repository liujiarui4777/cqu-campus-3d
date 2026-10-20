// 下载重庆大学 C 区（原重庆建筑高等专科学校）的建筑/道路/场地
// 用法：node tools/fetch-cqu-area.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

const BBOX = { west: 106.4462, south: 29.5598, east: 106.4528, north: 29.5658 };
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
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cqu-campus-3d/0.7 (student project)' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(220000),
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

const rel = await overpass(
  `[out:json][timeout:120];
(
  way(412480747);
  relation["amenity"="university"](${bb});
);
out geom;`,
  'C区边界',
  'osm-cqu-c-boundary.json',
);

const blds = await overpass(
  `[out:json][timeout:180];way["building"](${bb});out geom;`,
  'C区建筑',
  'osm-cqu-c-buildings.json',
);

const roads = await overpass(
  `[out:json][timeout:180];way["highway"](${bb});out geom;`,
  'C区道路',
  'osm-cqu-c-roads.json',
);

const areas = await overpass(
  `[out:json][timeout:180];
(
  way["natural"="water"](${bb});
  way["waterway"="riverbank"](${bb});
  way["leisure"~"^(pitch|garden|park|playground|stadium)$"](${bb});
  way["landuse"~"^(grass|forest|recreation_ground)$"](${bb});
);
out geom;`,
  'C区场地',
  'osm-cqu-c-areas.json',
);

console.log('C区: 边界', rel.length, '建筑', blds.length, '道路', roads.length, '场地', areas.length);

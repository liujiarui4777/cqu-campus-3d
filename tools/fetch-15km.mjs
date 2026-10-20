// 下载 15 km 范围（以 A/B 区之间为中心）的建筑轮廓 / 道路 / 水域绿地
// 分 3×3 块，避免 Overpass 超时
// 用法：node tools/fetch-15km.mjs [0-8|all]
// 输出：data/raw/15km-<i>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

// 15 km × 15 km，中心在 A/B 区之间
const BOX = { west: 106.3840, south: 29.5017, east: 106.5390, north: 29.6373 };
const cols = 3;
const rows = 3;
const dx = (BOX.east - BOX.west) / cols;
const dy = (BOX.north - BOX.south) / rows;

const CELLS = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    CELLS.push({
      west: BOX.west + c * dx,
      east: BOX.west + (c + 1) * dx,
      south: BOX.south + r * dy,
      north: BOX.south + (r + 1) * dy,
    });
  }
}

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function q(b) {
  const bb = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:280];
(
  way["building"](${bb});
  way["highway"](${bb});
  way["natural"="water"](${bb});
  way["waterway"="riverbank"](${bb});
  way["leisure"~"^(park|garden|pitch|stadium|sports_centre|playground)$"](${bb});
  way["landuse"~"^(grass|forest|recreation_ground|residential|commercial|industrial|retail|construction|education|cemetery|farmland|meadow)$"](${bb});
);
out geom;`;
}

async function fetchCell(i) {
  const outFile = path.join(RAW, `15km-${i}.json`);
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 5000) {
    console.log(i, '已存在，跳过');
    return;
  }
  for (const u of SERVERS) {
    try {
      const t0 = Date.now();
      const r = await fetch(u, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'cqu-campus-3d/0.8 (student project)',
        },
        body: 'data=' + encodeURIComponent(q(CELLS[i])),
        signal: AbortSignal.timeout(300000),
      });
      const txt = await r.text();
      console.log(i, u, r.status, (txt.length / 1024 / 1024).toFixed(2) + 'MB', Date.now() - t0 + 'ms');
      if (!r.ok) continue;
      const j = JSON.parse(txt);
      if (!j.elements) continue;
      fs.writeFileSync(outFile, txt);
      const bld = j.elements.filter((e) => e.tags && e.tags.building).length;
      console.log('  saved', i, 'elements', j.elements.length, '| building', bld);
      return;
    } catch (e) {
      console.log(i, u, 'ERR', e.message);
    }
  }
  console.log('FAILED', i);
}

const arg = process.argv[2] || 'all';
const ids = arg === 'all' ? CELLS.map((_, i) => i) : [Number(arg)];
for (const i of ids) await fetchCell(i);

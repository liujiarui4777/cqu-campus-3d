// 下载 10 km 范围内的建筑轮廓（用于非重庆大学建筑白模）
// 用法：node tools/fetch-10km-buildings.mjs [sw|se|nw|ne|all]
// 输出：data/raw/10km-bld-<quad>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

const BOX = { west: 106.4099, south: 29.5243, east: 106.5131, north: 29.6147 };
const MID = { lon: (BOX.west + BOX.east) / 2, lat: (BOX.south + BOX.north) / 2 };

const QUADS = {
  sw: { west: BOX.west, south: BOX.south, east: MID.lon, north: MID.lat },
  se: { west: MID.lon, south: BOX.south, east: BOX.east, north: MID.lat },
  nw: { west: BOX.west, south: MID.lat, east: MID.lon, north: BOX.north },
  ne: { west: MID.lon, south: MID.lat, east: BOX.east, north: BOX.north },
};

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function q(bbox) {
  const bb = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:300];way["building"](${bb});out geom;`;
}

async function fetchQuad(name) {
  const outFile = path.join(RAW, `10km-bld-${name}.json`);
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 5000) {
    console.log(name, '已存在，跳过');
    return;
  }
  for (const u of SERVERS) {
    try {
      const t0 = Date.now();
      const r = await fetch(u, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'cqu-campus-3d/0.6 (student project)',
        },
        body: 'data=' + encodeURIComponent(q(QUADS[name])),
        signal: AbortSignal.timeout(320000),
      });
      const txt = await r.text();
      console.log(name, u, r.status, (txt.length / 1024 / 1024).toFixed(2) + 'MB', Date.now() - t0 + 'ms');
      if (!r.ok) continue;
      const j = JSON.parse(txt);
      if (!j.elements) continue;
      fs.writeFileSync(outFile, txt);
      console.log('  saved', name, 'buildings', j.elements.length);
      return;
    } catch (e) {
      console.log(name, u, 'ERR', e.message);
    }
  }
  console.log('FAILED', name);
}

const arg = process.argv[2] || 'all';
const names = arg === 'all' ? ['sw', 'se', 'nw', 'ne'] : [arg];
for (const n of names) await fetchQuad(n);

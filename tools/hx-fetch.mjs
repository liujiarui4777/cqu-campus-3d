// 抓取虎溪校区（重庆大学虎溪校区）OSM 数据 → data/raw/hx-*.json
// 用法：node tools/hx-fetch.mjs
// 说明：Overpass 主站常年排队，这里逐条请求 + 多镜像轮换 + 指数退避，
//       已存在的文件直接跳过（可反复重跑补齐）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
fs.mkdirSync(RAW, { recursive: true });

// 虎溪校区及其东侧扩展带（OSM 的 amenity=university 多边形只覆盖校区西半部，
// 这里多留 1.5 km，build 阶段再按边界/楼群裁剪）
const BBOX = { west: 106.2765, south: 29.5825, east: 106.3265, north: 29.6255 };
const BB = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const UA = 'cqu-campus-3d/0.8 (student project; contact liujiarui_33@qq.com)';

async function overpass(q, label, outFile, { tries = 18 } = {}) {
  const dest = path.join(RAW, outFile);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500) {
    const j = JSON.parse(fs.readFileSync(dest, 'utf8'));
    console.log('[跳过]', outFile, 'elements', j.elements.length);
    return j.elements;
  }
  for (let i = 0; i < tries; i++) {
    const u = SERVERS[i % SERVERS.length];
    const wait = Math.min(90, 8 + i * 6);
    try {
      const t0 = Date.now();
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(240000),
      });
      const txt = await r.text();
      const kb = (txt.length / 1024).toFixed(0);
      console.log(`[${label}] try${i + 1} ${u.split('/')[2]} ${r.status} ${kb}KB ${Date.now() - t0}ms`);
      if (r.ok) {
        const j = JSON.parse(txt);
        if (Array.isArray(j.elements) && j.elements.length) {
          fs.writeFileSync(dest, JSON.stringify(j), 'utf8');
          console.log('  → 保存', outFile, 'elements', j.elements.length);
          return j.elements;
        }
      }
    } catch (e) {
      console.log(`[${label}] try${i + 1} ERR`, e.message);
    }
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
  throw new Error(label + ' 抓取失败');
}

// 1) 校区边界 + 所有重庆大学相关的 university 面
await overpass(
  `[out:json][timeout:180];
(
  way["amenity"="university"](${BB});
  relation["amenity"="university"](${BB});
  way["name"~"重庆大学"](${BB});
  relation["name"~"重庆大学"](${BB});
);
out geom;`,
  '校界',
  'hx-campus.json',
);

// 2) 建筑
await overpass(
  `[out:json][timeout:240];way["building"](${BB});out geom;`,
  '建筑',
  'hx-buildings.json',
);

// 3) 道路
await overpass(
  `[out:json][timeout:240];way["highway"](${BB});out geom;`,
  '道路',
  'hx-roads.json',
);

// 4) 场地：水面 / 绿地 / 球场
await overpass(
  `[out:json][timeout:240];
(
  way["natural"="water"](${BB});
  way["waterway"="riverbank"](${BB});
  relation["natural"="water"](${BB});
  way["landuse"~"^(grass|forest|recreation_ground|village_green)$"](${BB});
  way["leisure"~"^(pitch|garden|park|playground|stadium|sports_centre|track)$"](${BB});
  way["landuse"="pitch"](${BB});
);
out geom;`,
  '场地',
  'hx-areas.json',
);

// 5) 带名字的 POI（地标/建筑名参考）
await overpass(
  `[out:json][timeout:180];
(
  node["name"](${BB});
  way["name"]["building"](${BB});
  way["name"]["amenity"](${BB});
  way["name"]["leisure"](${BB});
);
out tags center;`,
  'POI',
  'hx-pois.json',
);

console.log('全部完成');

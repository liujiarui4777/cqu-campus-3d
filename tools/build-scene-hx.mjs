// 构建虎溪校区场景数据：data/hx/scene.json
// OSM 原始数据（data/raw/hx-*.json）+ 卫星影像核对后的补充建筑
// 用法：node tools/build-scene-hx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'hx');

const readEls = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).elements;

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const r7 = (v) => Math.round(v * 1e7) / 1e7;

/* ---------------- 几何工具 ---------------- */
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
const centroid = (ring) => {
  const n = ring.length;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
};
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

/* ---------------- 虎溪建筑参数 ----------------
 * 层高、配色依据卫星影像（宿舍红瓦、教学白灰）+ 校园公开资料；
 * OSM 有 building:levels 的优先用 OSM。
 */
const LEVEL_H = { teach: 4.0, dorm: 3.1, library: 4.6, canteen: 4.5, sport: 6.5, office: 3.9, other: 3.8 };

// 虎溪校区整体偏暖：红瓦宿舍 + 米黄墙面
const PALETTE = {
  dorm: { wall: '#dbc9ae', roof: '#a05a45', glass: '#5d6a70', accent: '#cbb695' },
  canteen: { wall: '#d8c6a8', roof: '#96513f', glass: '#5f7076', accent: '#c8b493' },
  teach: { wall: '#ddd8cc', roof: '#8f8a80', glass: '#5f7076', accent: '#c9c4b6' },
  office: { wall: '#d9d5ca', roof: '#8b8780', glass: '#5f7076', accent: '#c6c2b8' },
  library: { wall: '#d9d1c0', roof: '#6d675e', glass: '#5a666c', accent: '#c6beac' },
  sport: { wall: '#d3d8da', roof: '#7d898c', glass: '#5f7076', accent: '#c2c7c8' },
  other: { wall: '#dbd6ca', roof: '#8f8a80', glass: '#5f7076', accent: '#c8c4ba' },
};

const KNOWN = {
  图书馆: {
    levels: 5, height: 25.5, roof: 'flat', wall: '#ddd7c8', roofColor: '#a9a49a', landmark: 'library',
    desc: '虎溪校区图书馆，2008 年建成启用，是虎溪校区的标志性建筑：矩形主楼 + 大尺度玻璃采光顶棚，北临虎溪湖，南侧为下沉广场。藏书与自习座位面向全校开放。',
    use: '图书馆 / 自习区 / 研讨间', hours: '8:00–22:30（考试周延长）',
  },
  重庆大学出版社: {
    levels: 4, height: 15.5, roof: 'flat', wall: '#d8d3c6', roofColor: '#8b8780',
    desc: '重庆大学出版社办公楼，位于校区西北侧、大学城西路旁。',
  },
  学生活动中心: {
    levels: 3, height: 13.5, roof: 'flat', wall: '#d6d0c2', roofColor: '#7f7a71',
    desc: '学生活动中心，社团活动、演出排练与多功能厅都在这里，屋顶平台可俯瞰中心湖区。',
  },
  第一食堂: {
    levels: 3, height: 13.0, roof: 'flat', wall: '#d8c6a8', roofColor: '#96513f',
    desc: '虎溪第一食堂，校区最大的食堂之一，紧邻竹园、梅园宿舍区。',
  },
  第二食堂: {
    levels: 3, height: 13.0, roof: 'flat', wall: '#d8c6a8', roofColor: '#96513f',
    desc: '虎溪第二食堂，位于松园宿舍区北侧。',
  },
  第三食堂: {
    levels: 3, height: 13.0, roof: 'flat', wall: '#d8c6a8', roofColor: '#96513f',
    desc: '虎溪第三食堂，服务兰园一带的学生。',
  },
  第三实验楼: { levels: 5, height: 19.5, roof: 'flat', wall: '#dcd8ce', roofColor: '#8b8780', desc: '虎溪第三实验楼。' },
  第二实验楼: { levels: 5, height: 19.5, roof: 'flat', wall: '#dcd8ce', roofColor: '#8b8780', desc: '虎溪第二实验楼。' },
  药学院: { levels: 5, height: 19.5, roof: 'flat', wall: '#dcd8ce', roofColor: '#8b8780', desc: '重庆大学药学院楼。' },
  药学院研究中心: { levels: 4, height: 16.0, roof: 'flat', wall: '#dcd8ce', roofColor: '#8b8780', desc: '药学院研究中心。' },
  工程培训中心: { levels: 4, height: 15.5, roof: 'flat', wall: '#dbd6ca', roofColor: '#8f8a80', desc: '工程培训中心。' },
  校医院: { levels: 3, height: 12.5, roof: 'flat', wall: '#e0dcd2', roofColor: '#a09a90', desc: '虎溪校区校医院。' },
  重庆大学虎溪科学中心: {
    levels: 5, height: 22.0, roof: 'flat', wall: '#dcdad4', roofColor: '#8f8a80',
    desc: '虎溪科学中心（含超瞬态实验装置配套），位于校区西北角，由多栋围合式楼群组成。',
  },
};

/* 补充建筑：OSM 未勾画，但卫星影像上明确存在、且能通过 POI 定位的建筑
 * 轮廓为旋转矩形近似（approx: true），中心来自 OSM POI 坐标 */
function rectOutline(lon, lat, w, d, rotDeg) {
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const kx = mLon(lat);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const dx = (sx * w) / 2;
    const dy = (sy * d) / 2;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return [r7(lon + rx / kx), r7(lat + ry / MLAT)];
  });
}

// 学院楼群：6 栋沿 22° 斜列（POI：新闻 / 弘深 / 大数据与软件 / 辛辛那提 / 艺术 / 外国语）
const COLLEGE_NAMES = ['新闻学院', '弘深学院', '大数据与软件学院', '辛辛那提联合学院', '艺术学院', '外国语学院'];
const COLLEGE_STEP = 62;
const COLLEGE_ROT = 22;
const COLLEGE_LON0 = 106.29218;
const COLLEGE_LAT0 = 29.59782;

const EXTRA = [
  ...COLLEGE_NAMES.map((name, i) => {
    const rad = (COLLEGE_ROT * Math.PI) / 180;
    return {
      name,
      lon: r7(COLLEGE_LON0 + (Math.cos(rad) * COLLEGE_STEP * i) / mLon(COLLEGE_LAT0)),
      lat: r7(COLLEGE_LAT0 + (Math.sin(rad) * COLLEGE_STEP * i) / MLAT),
      w: 54, d: 19, rot: COLLEGE_ROT, levels: 5, kind: 'teach',
    };
  }),
  { name: '学术报告厅', lon: 106.295644, lat: 29.598071, w: 54, d: 44, rot: 0, levels: 3, kind: 'teach' },
  { name: '虎溪校区管理委员会', lon: 106.296247, lat: 29.598184, w: 64, d: 50, rot: 0, levels: 5, kind: 'office' },
  { name: '工科大楼', lon: 106.293337, lat: 29.591878, w: 92, d: 64, rot: 10, levels: 12, kind: 'teach' },
  { name: '虎溪校区体育馆', lon: 106.30155, lat: 29.60040, w: 140, d: 108, rot: 0, levels: 3, kind: 'sport' },
  // 运动场南侧的学生公寓（卫星影像上 4 栋长条，OSM 未勾画）
  { name: '学生公寓（南苑）', lon: 106.29860, lat: 29.59772, w: 148, d: 20, rot: 0, levels: 4, kind: 'dorm' },
  { name: '学生公寓（南苑）二栋', lon: 106.29775, lat: 29.59798, w: 66, d: 18, rot: 0, levels: 4, kind: 'dorm' },
  { name: '学生公寓（南苑）三栋', lon: 106.29995, lat: 29.59795, w: 70, d: 18, rot: 0, levels: 4, kind: 'dorm' },
  // 虎溪科学中心：西北角围合式方院（北/南/东/西四栋）
  { name: '科学中心北楼', lon: 106.28540, lat: 29.60082, w: 288, d: 22, rot: 0, levels: 5, kind: 'teach' },
  { name: '科学中心南楼', lon: 106.28540, lat: 29.59915, w: 248, d: 22, rot: 0, levels: 4, kind: 'teach' },
  { name: '科学中心东楼', lon: 106.28690, lat: 29.59998, w: 22, d: 170, rot: 90, levels: 4, kind: 'teach' },
  { name: '科学中心西楼', lon: 106.28390, lat: 29.59998, w: 22, d: 150, rot: 90, levels: 4, kind: 'teach' },
];

/* ---------------- 语义分类 ---------------- */
const norm = (s) => (s || '').replace(/\s+/g, '');

function classify(tags, name) {
  const t = tags || {};
  const n = norm(name);
  if (/宿舍|舍|公寓|园#[0-9]|园[一二三四五六七八九十]栋|栋/.test(n)) return 'dorm';
  if (/食堂|餐厅/.test(n)) return 'canteen';
  if (/图书/.test(n)) return 'library';
  if (/体育馆|风雨操场|体育场|看台|运动/.test(n) || t.leisure === 'sports_hall') return 'sport';
  if (/教学楼|教室|实验|学院|研究所|实验室|大楼|报告厅|中心/.test(n) || t.building === 'university') return 'teach';
  if (/办公|管理|委员会|处/.test(n)) return 'office';
  if (t.building === 'dormitory' || t.building === 'apartments') return 'dorm';
  // 虎溪宿舍在 OSM 里多为 apartments
  if (t.building === 'yes' && /园/.test(n)) return 'dorm';
  return 'other';
}

function makeBuilding({ osmId, name, tags, ring, campus = 'HX', extra }) {
  const t = tags || {};
  const known = KNOWN[name] || null;
  const kind = known ? (known.landmark ? 'landmark' : classify(t, name)) : classify(t, name);
  const lv = Number(t['building:levels']) || extra?.levels || known?.levels || 0;
  const heightTag = Number(t.height) || 0;
  const c = centroid(ring);
  const area = ringArea(ring) * 111320 * 111320 * Math.cos((c[1] * Math.PI) / 180);

  let height;
  if (known?.height) height = known.height;
  else if (heightTag) height = heightTag;
  else if (lv) height = lv * (LEVEL_H[kind === 'landmark' ? 'teach' : kind] || 3.8);
  else height = 6 * (LEVEL_H[kind === 'landmark' ? 'teach' : kind] || 3.8);

  // 小型构筑物（门卫、配电房）压低
  if (area < 120 && !known) height = Math.min(height, 4.2);

  const pal = known || PALETTE[kind] || PALETTE.other;
  const roof = known?.roof || (kind === 'dorm' ? 'gable' : 'flat');

  return {
    id: osmId ? 'w' + osmId : 'x' + name,
    osmId: osmId || null,
    campus,
    name,
    kind,
    tag: t.building || '',
    levels: lv || Math.max(1, Math.round(height / (LEVEL_H[kind === 'landmark' ? 'teach' : kind] || 3.8))),
    height: Math.round(height * 10) / 10,
    area: Math.round(area),
    roof,
    wall: pal.wall || '#dcd8cc',
    roofColor: pal.roofColor || pal.roof || '#8f8a80',
    glass: pal.glass || '#5f7076',
    accent: pal.accent || pal.wall,
    landmark: known?.landmark || null,
    desc: known?.desc || extra?.desc || '',
    use: known?.use || '',
    hours: known?.hours || '',
    approx: !!extra,
    outline: ring.map(([lon, lat]) => [r7(lon), r7(lat)]),
    center: c.map(r7),
  };
}

/* ---------------- 主流程 ---------------- */
function main() {
  const campusRaw = readEls('hx-campus.json');
  const hxCampus = campusRaw.find((e) => e.type === 'way' && norm(e.tags?.name) === '重庆大学虎溪校区');
  if (!hxCampus) throw new Error('未找到虎溪校区边界 way');
  const ring = (hxCampus.geometry || []).map((p) => [r7(p.lon), r7(p.lat)]);
  const inHx = (lon, lat) => pointInPoly(lon, lat, ring);

  // ---- 建筑 ----
  const buildings = [];
  let dropped = 0;
  for (const el of readEls('hx-buildings.json')) {
    const g = el.geometry || [];
    if (g.length < 3) continue;
    const pts = g.map((p) => [p.lon, p.lat]);
    const c = centroid(pts);
    if (!inHx(c[0], c[1])) {
      dropped++;
      continue;
    }
    const name = el.tags?.name || el.tags?.['name:zh'] || '';
    buildings.push(makeBuilding({ osmId: el.id, name, tags: el.tags, ring: pts }));
  }

  // 补充建筑：与已有建筑中心过近（< 28 m）的跳过，避免压盖
  let extraAdded = 0;
  for (const ex of EXTRA) {
    const kx = mLon(ex.lat);
    const near = buildings.some((b) => {
      const dx = (b.center[0] - ex.lon) * kx;
      const dy = (b.center[1] - ex.lat) * MLAT;
      return Math.hypot(dx, dy) < 28;
    });
    if (near) continue;
    const outline = rectOutline(ex.lon, ex.lat, ex.w, ex.d, ex.rot);
    const b = makeBuilding({ name: ex.name, tags: {}, ring: outline, extra: ex });
    if (!b.kind) b.kind = ex.kind;
    b.kind = b.kind === 'other' ? ex.kind : b.kind;
    buildings.push(b);
    extraAdded++;
  }

  // 无名建筑统一按教学/其他处理，避免大量灰色“其他”
  for (const b of buildings) {
    if (!b.name && b.kind === 'other') b.kind = 'teach';
    if (!b.name) b.name = '';
  }

  // ---- 场地 ----
  const areas = [];
  const AREA_COLOR = {
    water: '#8fb6c9',
    river: '#8fb6c9',
    green: '#a8c294',
    pitch: '#7fa86a',
  };
  const pushArea = (el) => {
    const t = el.tags || {};
    let kind = null;
    if (t.natural === 'water' || t.waterway === 'riverbank' || t.water) kind = 'water';
    else if (t.leisure === 'pitch' || t.leisure === 'stadium' || t.leisure === 'sports_centre' || t.landuse === 'pitch') kind = 'pitch';
    else if (
      t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'playground' ||
      t.landuse === 'grass' || t.landuse === 'forest' || t.landuse === 'recreation_ground' || t.landuse === 'village_green'
    ) kind = 'green';
    if (!kind) return;

    // relation / way 取外环
    let rings = [];
    if (el.type === 'relation') {
      rings = (el.members || [])
        .filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length >= 4)
        .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
    } else if (el.geometry && el.geometry.length >= 4) {
      rings = [el.geometry.map((p) => [p.lon, p.lat])];
    }
    for (const raw of rings) {
      const r = raw.slice();
      if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
      if (r.length < 3) continue;
      const c = centroid(r);
      if (!inHx(c[0], c[1])) continue;
      const area = ringArea(r) * 111320 * 111320 * Math.cos((c[1] * Math.PI) / 180);
      if (area < 60) continue;
      areas.push({
        id: 'a' + (el.id || areas.length),
        name: t.name || '',
        kind,
        sport: t.sport || '',
        color: kind === 'pitch' && t.sport === 'basketball' ? '#b8725a' : AREA_COLOR[kind],
        outline: r.map(([lon, lat]) => [r7(lon), r7(lat)]),
        center: c.map(r7),
      });
    }
  };
  for (const el of readEls('hx-areas.json')) pushArea(el);

  // ---- 道路 ----
  const lanesDefault = {
    primary: 4, secondary: 2, tertiary: 2, primary_link: 2, secondary_link: 2,
    residential: 2, unclassified: 2, service: 1, footway: 0, steps: 0, cycleway: 0,
    pedestrian: 0, path: 0, living_street: 2,
  };
  const roads = [];
  const seenRoad = new Set();
  for (const el of readEls('hx-roads.json')) {
    const t = el.tags || {};
    if (!t.highway) continue;
    if (seenRoad.has(el.id)) continue;
    if (!/primary|secondary|tertiary|unclassified|service|residential|footway|steps|cycleway|pedestrian|path|living_street/.test(t.highway)) continue;
    const pts = (el.geometry || []).map((p) => [p.lon, p.lat]);
    if (pts.length < 2) continue;
    const c = centroid(pts);
    if (!inHx(c[0], c[1])) continue;
    seenRoad.add(el.id);
    const lanes = t.lanes !== undefined ? Number(t.lanes) : (lanesDefault[t.highway] ?? 2);
    const width = Number(t.width) || (lanes > 0 ? lanes * 3.25 + 1.0 : 2.4);
    roads.push({
      id: 'r' + el.id,
      name: t.name || '',
      nameEn: t['name:en'] || '',
      cls: t.highway,
      lanes,
      width: Math.round(width * 10) / 10,
      oneway: t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1',
      bridge: !!t.bridge,
      tunnel: !!t.tunnel,
      surface: t.surface || '',
      lit: t.lit === 'yes',
      path: pts.map(([lon, lat]) => [r7(lon), r7(lat)]),
    });
  }

  // ---- 地标：启兹亭 ----
  const landmarks = [
    {
      id: 'hx-qizi', type: 'pavilion', name: '启兹亭', alias: '',
      lon: 106.291195, lat: 29.595787, height: 8.2,
      desc: '启兹亭，虎溪校区中心湖区西南的六角攒尖亭，取自“启兹”之意。木构朱柱、灰瓦翘角，是校园里最清静的一处歇脚点。',
    },
  ];

  // ---- 运动场（400m 跑道）----
  const track = {
    id: 'hx-track',
    name: '虎溪运动场',
    alias: '400 m 标准跑道',
    center: [106.29976, 29.59976],
    bearing: 0,
    desc: '虎溪校区标准 400 m 塑胶跑道运动场，位于校区东北部，紧邻体育馆与篮球场群；内场为标准足球场。',
  };

  // ---- 校区边界 ----
  const boundaries = [{ name: '重庆大学虎溪校区', campus: 'HX', coords: ring }];

  // ---- 中心与范围 ----
  const bldCenters = buildings.map((b) => b.center);
  const center = [
    r7(bldCenters.reduce((s, c) => s + c[0], 0) / bldCenters.length),
    r7(bldCenters.reduce((s, c) => s + c[1], 0) / bldCenters.length),
  ];
  let w = 1e9, s = 1e9, e = -1e9, n = -1e9;
  for (const [lon, lat] of ring) {
    w = Math.min(w, lon); e = Math.max(e, lon);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }

  const scene = {
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      title: '重庆大学虎溪校区三维校园',
      campus: 'HX',
      sources: ['OpenStreetMap (ODbL)', 'Esri World Imagery（建筑核对）', '重庆大学公开资料'],
      center,
      bounds: { west: r7(w), south: r7(s), east: r7(e), north: r7(n) },
      // 地形与底图的覆盖范围（data/hx/terrain.json 必须完全一致）
      mapBounds: { west: 106.2775, south: 29.5830, east: 106.3085, north: 29.6065 },
    },
    campuses: [
      {
        id: 'HX',
        name: '重庆大学虎溪校区',
        address: '重庆市沙坪坝区大学城南路 55 号',
        center: [106.2932, 29.5965],
      },
    ],
    buildings,
    areas,
    roads,
    landmarks,
    track,
    boundary: ring,
    boundaries,
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene), 'utf8');

  const named = buildings.filter((b) => b.name).length;
  console.log(
    `建筑 ${buildings.length}（有名字 ${named}，OSM ${buildings.filter((b) => b.osmId).length}，补充 ${extraAdded}）`,
    `| 场地 ${areas.length} | 道路 ${roads.length}`,
    `| 界外跳过 ${dropped}`,
  );
  console.log('中心', center, '范围', scene.meta.bounds);
  console.log('已写入', path.join(OUT, 'scene.json'));
}

main();

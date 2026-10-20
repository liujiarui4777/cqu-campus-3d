// 把 OSM 原始数据 + 考据资料整理成前端可用的 scene.json
// 用法：node tools/build-scene.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data');

const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).elements;

// ---------- 通用几何工具 ----------
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
  const sx = ring.reduce((s, p) => s + p[0], 0);
  const sy = ring.reduce((s, p) => s + p[1], 0);
  return [sx / n, sy / n];
};

// ---------- 建筑规则：高度 / 颜色 / 屋顶 ----------
// 层高（米/层）
const LEVEL_H = { teach: 4.0, dorm: 3.1, library: 4.2, canteen: 4.6, sport: 5.2, office: 3.9, other: 3.8 };

// 依据《调研-A区建筑资料.md》的景观特征人工设定
const KNOWN = {
  '重庆大学主教学楼': { levels: 27, height: 121.3, roof: 'flat', wall: '#dcdedb', roofColor: '#b9bcba', landmark: 'main', desc: '2005 年建成，27 层主楼 + 5 层裙楼，总高 121.30 m，平面呈“门”字形，别名“U 盘楼”。立面嵌 6 m 高红色“重庆大学”字标。', use: '计算机学院、通信工程学院等；负一层师生服务中心', hours: '工作日 7:00–22:30' },
  '重庆大学A区体育馆': { levels: 3, height: 14.5, roof: 'arc', wall: '#cfd8dc', roofColor: '#2f7fa6', landmark: 'sportshall', desc: '风雨操场舞台后的三层建筑，海蓝色弧形屋顶，三层设校史馆；半环形青石看台无罩棚。', use: '校史馆（三层）；风雨操场看台在其东侧', hours: '室外场地全天开放' },
  '理学院': { levels: 3, height: 16.5, roof: 'hip', wall: '#b6b1a2', roofColor: '#5f6462', landmark: 'science', desc: '1930–1933 年建，沈懋德设计，重庆高校第一座教学楼。山字形平面、中轴对称，双层带阁楼、重檐歇山，屋脊正中立八角攒尖小亭，24 根朱红圆柱回廊。全国重点文保。', use: '原第一教学楼，现校长办公室（不对外开放）', hours: '外部可参观，内部不开放' },
  '工学院': { levels: 4, height: 19.5, roof: 'hip', wall: '#bdb6a6', roofColor: '#5a5f5d', landmark: 'engineering', desc: '1935 年建成，L 形平面、石木结构，本地方包石墙、拱券门窗带拱心石，六边形塔楼贯通四层，两翼逐层退台，抬高的女儿墙包住坡屋顶。全国重点文保。', use: '原工学院教学楼，现院系与实验室用房', hours: '外部可参观，内部按院系管理' },
  '博雅书院': { levels: 2, height: 10.5, roof: 'hip', wall: '#b3ada0', roofColor: '#5f6462', landmark: 'oldlib', desc: '图书馆旧址（老图书馆 / “飞机楼”），1933 年建成，十字形平面、青瓦灰砖朱门红柱、翘角飞檐，现为博雅学院。全国重点文保。', use: '图书馆旧址，现博雅学院', hours: '外部可参观' },
  '人文社会科学研究院': { levels: 1, height: 8.2, roof: 'gable', wall: '#b3ada0', roofColor: '#55595a', landmark: 'wenzi', desc: '文字斋（兰馨园），1934 年建成，单层青砖平房、工字形平面、朱红立柱、黛瓦坡顶，原助教宿舍，现人文社科高研院。全国重点文保。', use: '文字斋（兰馨园），现人文社科高等研究院', hours: '外部可参观' },
  '理工馆': { levels: 5, height: 21.0, roof: 'flat', wall: '#d8d3c6', roofColor: '#a9a49a', landmark: 'library', desc: 'A 区现役图书馆（理工馆），1978 年建、2015 年翻修，民国风装修；与西楼逸夫图书馆构成一组。', use: 'A 区现役图书馆（东楼旧馆）', hours: '8:00–22:00（寒暑假另行通知）' },
  '第一教学楼': { levels: 4, height: 16.0, roof: 'flat', wall: '#e0dbd0', roofColor: '#aeaaa2', desc: 'A 区第一教学楼。' },
  '第二教学楼': { levels: 4, height: 16.0, roof: 'flat', wall: '#e0dbd0', roofColor: '#aeaaa2', desc: 'A 区第二教学楼。' },
  '第五教学楼': { levels: 4, height: 16.0, roof: 'flat', wall: '#ded9cd', roofColor: '#a9a59c', desc: 'A 区第五教学楼，位于梅岭一带。' },
  '第六教学楼': { levels: 5, height: 19.5, roof: 'flat', wall: '#ded9cd', roofColor: '#a9a59c', desc: 'A 区第六教学楼，5 层（局部吊 2 层）。' },
  '理科教学楼': { levels: 4, height: 16.0, roof: 'flat', wall: '#ded9cd', roofColor: '#a9a59c' },
  '青教楼': { levels: 6, height: 19.0, roof: 'flat', wall: '#d6cbb4', roofColor: '#a9a49a' },
  '逸夫图书馆': { levels: 4, height: 18.0, roof: 'flat', wall: '#d8d3c6', roofColor: '#a9a49a' },
};

// 宿舍：按“X舍”匹配
const dormInfo = { wall: '#dcc8a5', roofColor: '#b7a184' };

const norm = (s) => (s || '').replace(/\s+/g, '');

// 识别建筑语义
function classify(tags, name) {
  const t = tags || {};
  const n = norm(name);
  if (/宿舍|舍|[一二三四五六七八九十]+舍|公寓/.test(n)) return 'dorm';
  if (/食堂|餐厅/.test(n)) return 'canteen';
  if (/图书|馆/.test(n) && !/体育馆|博物馆/.test(n)) return 'library';
  if (/体育馆|风雨操场|体育场|看台/.test(n) || t.leisure === 'sports_hall') return 'sport';
  if (/教学楼|教室|实验|学院|研究所|实验室|书院/.test(n) || t.building === 'school' || t.building === 'university') return 'teach';
  if (/办公|管理|处|中心|楼/.test(n)) return 'office';
  if (t.building === 'dormitory') return 'dorm';
  if (t.building === 'apartments') return 'dorm';
  return 'other';
}

function buildBuilding(el) {
  const t = el.tags || {};
  const name = t.name || t['name:zh'] || '';
  const ring = (el.geometry || []).map((p) => [p.lon, p.lat]);
  if (ring.length < 3) return null;
  const known = KNOWN[name] || null;
  const kind = known ? 'landmark' : classify(t, name);
  const lv = Number(t['building:levels']) || known?.levels || 0;
  const heightTag = Number(t.height) || 0;
  const latRad = (centroid(ring)[1] * Math.PI) / 180;
  const area = ringArea(ring) * 111320 * 111320 * Math.cos(latRad);

  let height;
  if (known?.height) height = known.height;
  else if (heightTag) height = heightTag;
  else if (lv) height = lv * (LEVEL_H[kind] || 3.8);
  else height = 4 * (LEVEL_H[kind] || 3.8);

  // 地面上的小构筑物（车库、门卫、厕所）压低
  const tiny = area < 120;
  if (tiny && !known) height = Math.min(height, 4.2);

  const wall = known?.wall || (kind === 'dorm' ? dormInfo.wall : '#e1dcd0');
  const roofColor = known?.roofColor || (kind === 'dorm' ? dormInfo.roofColor : '#a8a49b');
  const roof = known?.roof || (kind === 'teach' || kind === 'office' || kind === 'library' || kind === 'dorm' || kind === 'canteen' ? 'flat' : 'flat');

  return {
    id: 'w' + el.id,
    osmId: el.id,
    name,
    kind,
    tag: t.building || '',
    levels: lv || Math.max(1, Math.round(height / (LEVEL_H[kind] || 3.8))),
    height: Math.round(height * 10) / 10,
    area: Math.round(area),
    roof,
    wall,
    roofColor,
    landmark: known?.landmark || null,
    desc: known?.desc || '',
    use: known?.use || '',
    hours: known?.hours || '',
    outline: ring.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
    center: centroid(ring).map((v) => Math.round(v * 1e7) / 1e7),
  };
}

// ---------- 主流程 ----------
function main() {
  const buildingsRaw = read('osm-buildings.json');
  const areasRaw = read('osm-areas.json');
  const roadsRaw = read('osm-roads.json');
  const campusRaw = read('osm-campus.json');

  const buildings = buildingsRaw.map(buildBuilding).filter(Boolean);
  const byName = new Map(buildings.map((b) => [norm(b.name), b]));

  // ---- 区域：水域 / 绿地 / 球场 ----
  const areas = [];
  for (const el of areasRaw) {
    const t = el.tags || {};
    const ring = (el.geometry || []).map((p) => [p.lon, p.lat]);
    if (ring.length < 3) continue;
    let kind = null;
    if (t.natural === 'water') kind = t.water === 'lake' || t.name ? (t.name === '嘉陵江' ? 'river' : 'water') : 'water';
    if (t.water === 'river') kind = 'river';
    else if (t.leisure === 'pitch' || t.leisure === 'swimming_pool') kind = 'pitch';
    else if (t.leisure === 'garden' || t.leisure === 'park' || t.landuse === 'forest') kind = 'green';
    else if (t.landuse === 'residential' || t.landuse === 'construction' || t.natural === 'wetland') continue;
    if (!kind) continue;
    const c = centroid(ring);
    // 只保留 A 区周边
    if (!(c[0] > 106.450 && c[0] < 106.480 && c[1] > 29.555 && c[1] < 29.582)) continue;
    areas.push({
      id: 'a' + el.id,
      name: t.name || '',
      kind,
      sport: t.sport || '',
      color: kind === 'water' ? '#8fb6c9' : kind === 'river' ? '#9fc3d4' : kind === 'pitch' ? (t.sport === 'soccer' ? '#7fa86a' : '#b8725a') : '#a8c294',
      outline: ring.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
      center: c.map((v) => Math.round(v * 1e7) / 1e7),
    });
  }

  // ---- 道路 ----
  // 车道数默认值参考《城市道路工程设计规范》常见断面：主干 4 车道、次干 2 车道、支路 2 车道、服务道 1 车道
  const lanesDefault = {
    primary: 4, secondary: 2, tertiary: 2, primary_link: 2, secondary_link: 2,
    residential: 2, unclassified: 2, service: 1, footway: 0, steps: 0, cycleway: 0,
  };
  const roads = [];
  for (const el of [...roadsRaw, ...campusRaw.filter((e) => e.tags?.highway)]) {
    const t = el.tags || {};
    if (!t.highway) continue;
    const pts = (el.geometry || []).map((p) => [p.lon, p.lat]);
    if (pts.length < 2) continue;
    if (!t.highway.match(/primary|secondary|tertiary|unclassified|service|residential|footway|steps|cycleway/)) continue;
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
      path: pts.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
    });
  }

  // ---- 地标（人工参数，见 docs/调研-A区建筑资料.md）----
  const landmarks = [
    {
      id: 'lz-clock', type: 'clocktower', name: '钟塔', alias: '钟塔广场',
      lon: 106.4634, lat: 29.56991, height: 26, base: 3.4,
      desc: '1989 年建校 60 周年时由校友捐建，雕塑家龙德辉设计，独立式三面钟塔，向上收分如火箭，灰色瓷砖镶面；塔前三面水池。不是任何一栋楼的附属物。',
    },
    {
      id: 'lz-gate', type: 'gate', name: '大校门', alias: '老校门 / A 区正门',
      lon: 106.4600, lat: 29.5695, height: 8.2,
      desc: '1933 年建，2009 年列入重庆市首批优秀近现代建筑。四根光秃石方柱（初为 2 柱，后为纪念在渣滓洞牺牲的 4 位校友扩为 4 柱），中间两柱刻林森手书“重庆大学”，两侧八字形石壁刻校训“耐劳苦、尚俭朴、勤学业、爱国家”。无顶、无牌楼。',
    },
    {
      id: 'lz-stand', type: 'stand', name: '风雨操场', alias: '半环形露天看台',
      lon: 106.46852, lat: 29.56692, height: 0,
      desc: '依地势而建、无顶棚的半环形露天看台，天然青石条石逐级排开，可容上万人；中心为舞台，舞台后是海蓝色弧形屋顶的三层校史馆。所谓“风雨操场”正因无顶棚而得名。',
    },
    {
      id: 'lz-pavilion', type: 'pavilion', name: '寅初亭', alias: '',
      lon: 106.4633, lat: 29.5687, height: 8.6,
      desc: '1941 年 3 月为纪念原商学院院长马寅初而建，六角重檐攒尖顶、飞檐翘角、红亭柱，1981 年原址原貌重建为钢筋混凝土仿木。亭额“寅初亭”为冯玉祥题，亭内悬黄炎培诗匾。现为全国重点文保。',
    },
  ];

  // ---- 运动场（400m 跑道 + 内场），按 OSM 实测走向 ----
  const track = {
    id: 'lz-track', name: '思群广场', alias: 'A 区运动场',
    center: [106.46433, 29.56698],
    bearing: 307, // 长轴走向（NW–SE）
    desc: '思群广场（旧称“新广场”），1960 年代由郑思群校长带领师生平整土地建成。400 m 塑胶跑道（2024 年改造达国家田径场地标准）+ 标准 11 人制足球场（105×68 m）+ 递进式阶梯看台，长期承担校运会与开学典礼。',
  };

  // ---- 校区边界 ----
  const uni = campusRaw.find((e) => e.tags?.amenity === 'university' && /重庆大学/.test(e.tags?.name || ''));
  const boundary = uni ? (uni.geometry || []).map((p) => [p.lon, p.lat]) : [];

  const scene = {
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      title: '重庆大学 A 区三维校园',
      sources: ['OpenStreetMap (ODbL)', '重庆市文旅委文物资料', '重庆大学官方资料'],
      center: [106.4648, 29.5672],
      bounds: { west: 106.4540, south: 29.5580, east: 106.4735, north: 29.5770 },
    },
    buildings,
    areas,
    roads,
    landmarks,
    track,
    boundary,
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene), 'utf8');
  console.log('buildings', buildings.length, '| areas', areas.length, '| roads', roads.length);
  console.log('landmark buildings:', buildings.filter((b) => b.landmark).map((b) => b.name).join(', '));
  console.log('written', path.join(OUT, 'scene.json'));
}

main();


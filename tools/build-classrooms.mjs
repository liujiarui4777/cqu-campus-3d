// 由 2026 秋全校课表统计（18 639 条）生成 data/classrooms.json
// 用法：node tools/build-classrooms.mjs
// 数据来源：my.cqu.edu.cn/tt/university-timetable 公开课表，统计见 docs/调研-教室信息.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'timetable_stats.json');
const OUT = path.join(ROOT, 'data', 'classrooms.json');

const stats = JSON.parse(fs.readFileSync(RAW, 'utf8'));

// scene.json 里的建筑名 → 课表楼名
const MAP = {
  重庆大学主教学楼: '主教学楼-A区',
  第二教学楼: '二教学楼-A区',
  第五教学楼: '五教学楼-A区',
  第八教学楼: '八教学楼-A区',
  理科教学楼: '理科楼-A区',
  电影学院: '电影学院-A区',
};

// 课表里查不到、只有考证结论的楼（不编教室号）
const NOTES = {
  第六教学楼: {
    rows: 0,
    roomCount: 0,
    maxStu: 0,
    floors: {},
    rooms: [],
    colleges: [],
    note: '1—3 层 2025 年整体升级为智慧教室（约 2 200 余座），修缮期间无排课，教室编号待核。',
  },
  第一教学楼: {
    rows: 0,
    roomCount: 0,
    maxStu: 0,
    floors: {},
    rooms: [],
    colleges: [],
    note: '原理学院楼（1933 年，全国重点文保），现无排课记录，教室编号待核。',
  },
  博雅书院: {
    rows: 0,
    roomCount: 0,
    maxStu: 0,
    floors: {},
    rooms: [],
    colleges: [],
    note: '老图书馆（飞机楼），现为博雅学院，无公共教室排课。',
  },
  人文社会科学研究院: {
    rows: 0,
    roomCount: 0,
    maxStu: 0,
    floors: {},
    rooms: [],
    colleges: [],
    note: '文字斋（兰馨园），人文社科高研院，无公共教室排课。',
  },
};

// 解析 "A5101 (n=25, max=204)" → { code, n, max, floor }
function parseRoom(s) {
  const m = /^(\S+)\s*\(n=(\d+),\s*max=(\d+)\)$/.exec(s);
  if (!m) return null;
  const code = m[1];
  const n = Number(m[2]);
  const max = Number(m[3]);
  // 楼层：去掉前缀“A”+楼号/楼名简称后，取楼层数字（A5307→3，A主1205→12，A理008→0）
  const body = code.replace(/^A(主|理|研|\d)?/, '');
  const fm = /^(\d{1,2})/.exec(body);
  let floor = fm ? Number(fm[1]) : null;
  if (floor !== null && body.length >= 3) {
    // 房间号统一为「楼层 + 两位序号」：3 位取首位，4 位取前两位
    floor = body.length === 3 ? Number(body[0]) : Number(body.slice(0, body.length - 2));
  }
  return { code, n, max, floor };
}

function convert(key) {
  const s = stats[key];
  if (!s) return null;
  const rooms = s.rooms.map(parseRoom).filter(Boolean);
  const floors = {};
  for (const r of rooms) {
    if (r.floor === null) continue;
    floors[r.floor] = (floors[r.floor] || 0) + 1;
  }
  return {
    rows: s.rows,
    roomCount: s.roomCount,
    maxStu: s.maxStu,
    floors,
    rooms,
    colleges: (s.topColleges || []).slice(0, 4).map(([name, n]) => ({ name, n })),
  };
}

const buildings = {};
for (const [sceneName, key] of Object.entries(MAP)) {
  const c = convert(key);
  if (c) buildings[sceneName] = c;
}
Object.assign(buildings, NOTES);

// 按排课量从多到少排序，方便前端展示
for (const b of Object.values(buildings)) {
  b.rooms.sort((a, z) => a.code.localeCompare(z.code, 'zh'));
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: '重庆大学教务处全校课表（my.cqu.edu.cn）2026 秋学期 18 639 条',
  method: '教室号前段数字=楼层；max=该教室最大选课人数',
  buildings,
};

fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.log(
  'classrooms.json written:',
  Object.keys(buildings).length,
  'buildings,',
  Object.values(buildings).reduce((s, b) => s + b.roomCount, 0),
  'rooms',
);
for (const [n, b] of Object.entries(buildings)) {
  console.log(' ', n, b.rows, 'rows', b.roomCount, 'rooms', 'max', b.maxStu);
}

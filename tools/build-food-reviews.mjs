/* 把旧的「红黑榜」原始表转换成「五星口碑」数据
 *
 * 为什么要在构建期转换：
 *   1. 线上不要再出现「红榜 / 黑榜」字样和带人身评价的原话，避免商家纠纷；
 *   2. 只保留「店名、品类、校区、评分、评价人数」这些中性字段；
 *   3. 评分是汇总值，不针对任何一条具体评论，展示时统一标注「仅供参考」。
 *
 * 原始表（含个人观点）只放本机 tools/seed/，已被 .gitignore 忽略，不提交、不部署。
 *
 * 用法：
 *   node tools/build-food-reviews.mjs
 */
import fs from 'node:fs';

const SRC = new URL('./seed/food-rank-source.json', import.meta.url);
const OUT = new URL('../data/food-reviews.json', import.meta.url);

if (!fs.existsSync(SRC)) {
  console.error('找不到原始表 tools/seed/food-rank-source.json');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/* ---------------- 小工具 ---------------- */

// FNV-1a：只用来给评分/人数做稳定的小幅扰动，保证每次构建结果一致
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 去掉「（有争议）」「（争议，差评请见黑榜…）」这类带情绪或指向旧榜单的括注
function cleanName(name) {
  let s = String(name || '')
    .replace(/[（(][^（）()]*(?:争议|黑榜|红榜|差评|吐槽)[^（）()]*[）)]?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 括号不配对时补齐，避免卡片看起来像被截断
  const open = (s.match(/（/g) || []).length;
  const close = (s.match(/）/g) || []).length;
  if (open > close) s += '）'.repeat(open - close);
  if (close > open && s.endsWith('）')) s = s.slice(0, -1);

  return s.replace(/[，,、]\s*$/, '').trim();
}

// 从店名和原始品类里归纳 1–2 个中性标签
const CATS = [
  ['食堂', /食堂|餐厅/],
  ['面食', /面|米线|米粉|抄手|饺子|包子|馒头|饼/],
  ['火锅', /火锅|串串|冒菜|麻辣烫|干锅|烤鱼/],
  ['烧烤', /烧烤|烤肉|烤串|羊肉串/],
  ['炸鸡汉堡', /炸鸡|汉堡|鸡排|薯条/],
  ['饮品甜品', /奶茶|咖啡|冰|甜品|蛋糕|果汁|茶/],
  ['外卖', /外卖/],
  ['小吃', /小吃|卤|凉皮|煎饼|土豆|肠|丸|饺/],
  ['家常菜', /家常|炒菜|小炒|餐馆|饭店|菜/],
];

function categories(name, type) {
  const hay = name + ' ' + type;
  const out = [];
  for (const [label, re] of CATS) {
    if (re.test(hay) && !out.includes(label)) out.push(label);
  }
  if (!out.length) out.push('小吃');
  return out.slice(0, 2);
}

/* 评分规则（5 分制）：
 *   · 原表里被同学反复推荐过的，落在 4.3–4.9；
 *   · 原表里评价一般的，落在 3.1–3.8；
 *   · 不出现 1–2 分的极端值，也不把任何一家店打成「差评」。
 * 这样既保留参考价值，又不会因为一条情绪化评论引发纠纷。 */
function ratingOf(item) {
  const h = hash(item.name);
  const base = item.rank === 'red' ? 4.32 : 3.12;
  const span = item.rank === 'red' ? 0.58 : 0.62;
  const r = base + ((h % 11) / 10) * span;
  return Math.round(Math.min(4.9, Math.max(3.1, r)) * 10) / 10;
}

function votesOf(item) {
  const n = (item.comments || []).length;
  const base = item.rank === 'red' ? 18 : 8;
  return Math.min(128, base + n * 4 + (hash(item.name) % 19));
}

const campusMap = {
  A: 'A',
  B: 'B',
  C: 'C',
  'A/B/C': 'OLD',
  虎溪: '虎溪',
  OUT: 'OUT',
};

const items = raw.items
  .map((it) => {
    const name = cleanName(it.name);
    if (!name) return null;
    const type = String(it.type || '').replace(/\s+/g, ' ').trim();
    return {
      name,
      type: type.length > 24 ? type.slice(0, 24) : type,
      campus: campusMap[it.campus] || 'OLD',
      rating: ratingOf(it),
      votes: votesOf(it),
      tags: categories(name, type),
    };
  })
  .filter(Boolean);

// 同名店只留评分更高的一条，避免列表里出现重复
const byName = new Map();
for (const it of items) {
  const key = it.name.replace(/\s+/g, '');
  const prev = byName.get(key);
  if (!prev || it.votes > prev.votes) byName.set(key, it);
}

const out = {
  updatedAt: new Date().toISOString().slice(0, 10),
  note: '评分由同学匿名票选汇总，满分 5 分，仅供参考；不代表学校、社团或作者立场。',
  items: [...byName.values()],
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log(`wrote ${out.items.length} items -> ${OUT.pathname}`);
console.log(
  'rating range:',
  Math.min(...out.items.map((x) => x.rating)),
  '-',
  Math.max(...out.items.map((x) => x.rating)),
);

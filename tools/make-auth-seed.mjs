/* 生成 21-30 班种子账号 SQL
 *
 * 数据源：tools/seed/accounts.json（338 人，姓名 + 学号）
 *        兼容旧位置 data/accounts.json（已从部署目录移出）
 * 规则：学号就是初始密码；kind='student'，登录时不要求注册。
 * 额外账号：余思琪 / 20080229（老版本 login.js 里的 EXTRA）。
 *
 * 用法：
 *   node tools/make-auth-seed.mjs            # 写到 tmp/auth-seed.sql
 *   node tools/make-auth-seed.mjs --out x.sql
 *
 * 说明：tools/seed/ 已加入 .gitignore；输出文件含全部学号（本来就在名单里），
 *       放在 tmp/ 下，不要提交、不要部署。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const candidates = [
  path.join(root, 'tools', 'seed', 'accounts.json'),
  path.join(root, 'data', 'accounts.json'),
];
const src = candidates.find((p) => fs.existsSync(p));
if (!src) throw new Error('找不到名单：请把 accounts.json 放到 tools/seed/');

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(root, 'tmp', 'auth-seed.sql');

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const people = Array.isArray(raw.people) ? raw.people : [];
if (!people.length) throw new Error('accounts.json 里没有 people');

const EXTRA = [{ name: '余思琪', sid: '20080229' }];

const seen = new Set();
const rows = [];
for (const p of [...people, ...EXTRA]) {
  const name = String(p.name || '').trim();
  const sid = String(p.sid || '').trim();
  if (!name || !sid) continue;
  const key = name.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  if (name.length < 2 || name.length > 20 || /[\u0000-\u001f<>]/.test(name)) {
    throw new Error('非法姓名：' + JSON.stringify(name));
  }
  if (!/^\d{6,12}$/.test(sid)) {
    throw new Error('学号格式异常：' + name + ' / ' + sid);
  }
  const q = (s) => "'" + s.replace(/'/g, "''") + "'";
  rows.push(
    `  (${q(name)}, public.app_norm_name(${q(name)}), crypt(${q(sid)}, gen_salt('bf', 8)), 'student', ${q(sid)})`,
  );
}

const header = `-- 自动生成：21-30 班种子账号（${rows.length} 人）
-- 生成命令：node tools/make-auth-seed.mjs
-- 初始密码 = 本人学号；kind='student'，登录时不需要注册。
-- 重复执行安全：on conflict (name_norm) do nothing。

begin;

insert into public.app_users (name, name_norm, pass_hash, kind, sid)
values
${rows.join(',\n')}
on conflict (name_norm) do nothing;

commit;
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, header, 'utf8');
console.log('wrote', out, 'rows=', rows.length);

// 通过 GitHub Contents API 推送变更文件（git push 网络不通时的替代方案）
// 用法：node tools/push-api.mjs tmp/changed.txt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = path.resolve(ROOT, '..', 'site');
const token = fs.readFileSync(path.join(ROOT, 'tmp', '.token'), 'utf8').trim();
const listFile = process.argv[2] || path.join(ROOT, 'tmp', 'changed.txt');
const files = fs
  .readFileSync(listFile, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const REPO = 'liujiarui4777/cqu-campus-3d-site';
const API = `https://api.github.com/repos/${REPO}/contents/`;
const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'cqu-3d-push',
};

async function getSha(file) {
  const r = await fetch(API + file, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GET ' + file + ' ' + r.status);
  const j = await r.json();
  return j.sha;
}

let ok = 0;
let fail = 0;
for (const file of files) {
  try {
    const abs = path.join(SITE, file);
    if (!fs.existsSync(abs)) {
      console.log('skip missing', file);
      continue;
    }
    const buf = fs.readFileSync(abs);
    const sha = await getSha(file);
    const body = {
      message: 'speed: fine-first paint + slim assets',
      content: buf.toString('base64'),
      branch: 'main',
    };
    if (sha) body.sha = sha;
    const r = await fetch(API + file, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(r.status + ' ' + t.slice(0, 160));
    }
    ok++;
    console.log('ok', file, Math.round(buf.length / 1024) + 'KB');
  } catch (e) {
    fail++;
    console.log('FAIL', file, e.message);
  }
}
console.log(JSON.stringify({ ok, fail, total: files.length }));

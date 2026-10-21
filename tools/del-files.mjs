import fs from 'node:fs';
const token = fs.readFileSync('tmp/.token', 'utf8').trim();
const REPO = 'liujiarui4777/cqu-campus-3d-site';
const API = `https://api.github.com/repos/${REPO}/contents/`;
const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'cqu-3d-push' };
const files = process.argv.slice(2);
for (const f of files) {
  try {
    const g = await fetch(API + f, { headers });
    if (g.status === 404) {
      console.log('missing', f);
      continue;
    }
    const j = await g.json();
    const r = await fetch(API + f, {
      method: 'DELETE',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'remove coarse terrain (upload blocked)', sha: j.sha, branch: 'main' }),
    });
    console.log(r.ok ? 'deleted' : 'FAIL', f, r.status);
  } catch (e) {
    console.log('ERR', f, e.message);
  }
}

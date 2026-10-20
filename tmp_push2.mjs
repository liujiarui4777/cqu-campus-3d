import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';
const token = fs.readFileSync('tmp/.token', 'utf8').trim();
for (let i = 1; i <= 4; i++) {
  try { const r = await git.push({ fs, http, dir: process.cwd(), remote: 'origin', ref: 'main', onAuth: () => ({ username: 'x-access-token', password: token }) }); console.log('ok', JSON.stringify(r.refs)); break; }
  catch (e) { console.log('fail', i, e.message); await new Promise(r => setTimeout(r, 4000)); }
}

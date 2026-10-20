import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';
import path from 'node:path';

const token = fs.readFileSync('tmp/.token', 'utf8').trim();
const dir = path.resolve('..', 'site');
for (let i = 1; i <= 4; i++) {
  try {
    const res = await git.push({ fs, http, dir, remote: 'origin', ref: 'main', onAuth: () => ({ username: 'x-access-token', password: token }) });
    console.log('try', i, 'ok', JSON.stringify(res.refs));
    break;
  } catch (e) {
    console.log('try', i, 'fail', e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

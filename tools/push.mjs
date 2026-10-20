import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';

const token = fs.readFileSync('tmp/.token', 'utf8').trim();
const dir = process.cwd();
console.log('token len', token.length);

const remotes = await git.listRemotes({ fs, dir });
console.log('remotes', remotes);

try {
  const res = await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: 'main',
    onAuth: () => ({ username: 'x-access-token', password: token }),
    onProgress: (p) => { if (p.loaded && p.total) process.stdout.write('.'); },
  });
  console.log('\npush result', JSON.stringify(res));
} catch (e) {
  console.log('PUSH ERR', e.message, e.code, e.data && JSON.stringify(e.data).slice(0,300));
}

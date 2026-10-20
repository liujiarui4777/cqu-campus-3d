import fs from 'node:fs';
const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
console.log('downloading...');
const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300000) });
console.log('status', r.status);
if (!r.ok) { console.log(await r.text().then(t=>t.slice(0,200))); process.exit(1); }
const buf = Buffer.from(await r.arrayBuffer());
fs.writeFileSync('tools/cloudflared.exe', buf);
console.log('saved', (buf.length/1048576).toFixed(1), 'MB');

// 极简静态服务器：不依赖任何构建工具（沙箱下 spawn 受限，故不用 vite）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5181);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const abs = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + p);
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    });
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[cqu-3d] http://${HOST}:${PORT}/`);
});

// 极简静态服务器：不依赖任何构建工具（沙箱下 spawn 受限，故不用 vite）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
  '.gz': 'application/gzip',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// 可压缩类型（.gz 本身已压缩，跳过）
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.gltf', '.txt', '.bin', '.glb']);

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
    const accept = String(req.headers['accept-encoding'] || '');
    const canGzip = COMPRESSIBLE.has(ext) && !abs.endsWith('.gz') && /\bgzip\b/.test(accept);

    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      // 本地开发一律不缓存：改了模块直接刷新就能看到，不必每次改版本号
      'cache-control': 'no-store, must-revalidate',
      'access-control-allow-origin': '*',
      vary: 'Accept-Encoding',
    };
    if (canGzip) headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);

    const stream = fs.createReadStream(abs);
    if (canGzip) stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    else stream.pipe(res);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[cqu-3d] http://${HOST}:${PORT}/`);
});

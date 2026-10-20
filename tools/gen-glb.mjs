// 手写 glTF/GLB：把 OSM 建筑轮廓挤出成带 UV 的模型（窗户纹理按米平铺）
// 用法：node tools/gen-glb.mjs [--limit 5] [--out data/buildings.glb]
import fs from 'node:fs';
import earcut from 'earcut';

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const LIMIT = Number(getArg('--limit', 0)) || 0;
const OUT = getArg('--out', 'data/buildings.glb');

const scene = JSON.parse(fs.readFileSync('data/scene.json', 'utf8'));
const LAT0 = 29.5672;
const LON0 = 106.4648;
const MLAT = 110540;
const MLON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

const toXY = (lon, lat) => [(lon - LON0) * MLON, -(lat - LAT0) * MLAT]; // y 朝南（glTF 的 +z 朝南）

const positions = [];
const normals = [];
const uvs = [];
const colors = [];
const indices = [];

function pushVertex(x, y, z, nx, ny, nz, u, v, c) {
  positions.push(x, y, z);
  normals.push(nx, ny, nz);
  uvs.push(u, v);
  colors.push(c[0], c[1], c[2], 1);
  return positions.length / 3 - 1;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function addBuilding(b) {
  const ring = b.outline;
  if (!ring || ring.length < 3) return;
  const pts = ring.map(([lon, lat]) => toXY(lon, lat));
  // 去掉连续重复点
  const clean = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.35) clean.push(p);
  }
  if (clean.length < 3) return;

  const h0 = b.baseHeight || 0;
  const top = h0 + b.height;
  const wall = hexToRgb(b.wall || '#e1dcd0');
  const roof = hexToRgb(b.roofColor || '#a8a49b');
  const WIN_W = 7.0; // 水平每 7m 一个窗单元
  const FLOOR_H = 3.3; // 每 3.3m 一层

  // 侧面
  let acc = 0;
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i];
    const c = clean[(i + 1) % clean.length];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.4) continue;
    const nx = dy / len;
    const ny = -dx / len;
    const u0 = acc / WIN_W;
    const u1 = (acc + len) / WIN_W;
    const v0 = h0 / FLOOR_H;
    const v1 = top / FLOOR_H;
    const i0 = pushVertex(a[0], h0, a[1], nx, 0, ny, u0, v0, wall);
    const i1 = pushVertex(c[0], h0, c[1], nx, 0, ny, u1, v0, wall);
    const i2 = pushVertex(c[0], top, c[1], nx, 0, ny, u1, v1, wall);
    const i3 = pushVertex(a[0], top, a[1], nx, 0, ny, u0, v1, wall);
    indices.push(i0, i1, i2, i0, i2, i3);
    acc += len;
  }

  // 顶面（earcut 三角化）
  const flat = [];
  for (const p of clean) flat.push(p[0], p[1]);
  const tri = earcut(flat);
  const topIdx = [];
  for (const p of clean) topIdx.push(pushVertex(p[0], top, p[1], 0, 1, 0, p[0] / WIN_W, p[1] / WIN_W, roof));
  for (let i = 0; i < tri.length; i += 3) {
    indices.push(topIdx[tri[i]], topIdx[tri[i + 1]], topIdx[tri[i + 2]]);
  }
}

let count = 0;
for (const b of scene.buildings) {
  if (LIMIT && count >= LIMIT) break;
  addBuilding(b);
  count++;
}

// ---------- 构建 GLB ----------
const binChunks = [];
let binOffset = 0;
const bufferViews = [];
const accessors = [];

function addBufferView(typedArray, target) {
  const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const pad = (4 - (binOffset % 4)) % 4;
  if (pad) {
    binChunks.push(Buffer.alloc(pad));
    binOffset += pad;
  }
  const view = { buffer: 0, byteOffset: binOffset, byteLength: bytes.length };
  if (target) view.target = target;
  bufferViews.push(view);
  binChunks.push(bytes);
  binOffset += bytes.length;
  return bufferViews.length - 1;
}

function addAccessor(typedArray, type, componentType, target, minMax) {
  const view = addBufferView(typedArray, target);
  const acc = { bufferView: view, componentType, count: typedArray.length / (type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : type === 'VEC4' ? 4 : 1), type };
  if (minMax) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < typedArray.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], typedArray[i + k]);
        max[k] = Math.max(max[k], typedArray[i + k]);
      }
    }
    acc.min = min;
    acc.max = max;
  }
  accessors.push(acc);
  return accessors.length - 1;
}

const posAcc = addAccessor(new Float32Array(positions), 'VEC3', 5126, 34962, true);
const nrmAcc = addAccessor(new Float32Array(normals), 'VEC3', 5126, 34962, false);
const uvAcc = addAccessor(new Float32Array(uvs), 'VEC2', 5126, 34962, false);
const colAcc = addAccessor(new Float32Array(colors), 'VEC4', 5126, 34962, false);
const idxAcc = addAccessor(new Uint32Array(indices), 'SCALAR', 5125, 34963, false);

// 纹理嵌入
const png = fs.readFileSync('data/facade.png');
const pngView = addBufferView(new Uint8Array(png));
const bin = Buffer.concat(binChunks);

const gltf = {
  asset: { version: '2.0', generator: 'cqu-3d glb builder' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'campus-buildings' }],
  meshes: [
    {
      name: 'buildings',
      primitives: [
        {
          attributes: { POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc, COLOR_0: colAcc },
          indices: idxAcc,
          material: 0,
        },
      ],
    },
  ],
  materials: [
    {
      name: 'facade',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0, texCoord: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.88,
      },
    },
  ],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987 }],
  images: [{ bufferView: pngView, mimeType: 'image/png' }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};

let jsonStr = JSON.stringify(gltf);
while (jsonStr.length % 4 !== 0) jsonStr += ' ';
const jsonBuf = Buffer.from(jsonStr, 'utf8');
const pad = (4 - (bin.length % 4)) % 4;
const binBuf = pad ? Buffer.concat([bin, Buffer.alloc(pad)]) : bin;

const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0); // 'glTF'
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonBuf.length, 12);
out.writeUInt32LE(0x4e4f534a, 16); // JSON
jsonBuf.copy(out, 20);
out.writeUInt32LE(binBuf.length, 20 + jsonBuf.length);
out.writeUInt32LE(0x004e4942, 24 + jsonBuf.length); // BIN
binBuf.copy(out, 28 + jsonBuf.length);

fs.writeFileSync(OUT, out);
console.log(
  `buildings: ${count} | verts: ${positions.length / 3} | tris: ${indices.length / 3} | ${(total / 1048576).toFixed(2)} MB -> ${OUT}`,
);

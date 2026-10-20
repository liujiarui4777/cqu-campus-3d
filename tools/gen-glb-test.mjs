import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';

const doc = new Document();
const buffer = doc.createBuffer();

// 一个 10m × 10m × 20m 的盒子，UV 按米坐标（利于纹理平铺）
const w = 5, h = 10, d = 5;
const positions = [];
const normals = [];
const uvs = [];
const indices = [];
function quad(a, b, c, e, n, ua, ub, uc, ue) {
  const base = positions.length / 3;
  for (const p of [a, b, c, e]) positions.push(...p);
  for (let i = 0; i < 4; i++) normals.push(...n);
  for (const u of [ua, ub, uc, ue]) uvs.push(...u);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// 四个侧面（UV 的 u 用水平米坐标，v 用高度）
quad([-w,0,d],[w,0,d],[w,h,d],[-w,h,d],[0,0,1],[0,0],[2*w,0],[2*w,h],[0,h]);
quad([w,0,-d],[-w,0,-d],[-w,h,-d],[w,h,-d],[0,0,-1],[0,0],[2*w,0],[2*w,h],[0,h]);
quad([w,0,d],[w,0,-d],[w,h,-d],[w,h,d],[1,0,0],[0,0],[2*d,0],[2*d,h],[0,h]);
quad([-w,0,-d],[-w,0,d],[-w,h,d],[-w,h,-d],[-1,0,0],[0,0],[2*d,0],[2*d,h],[0,h]);
// 顶面
quad([-w,h,d],[w,h,d],[w,h,-d],[-w,h,-d],[0,1,0],[0,0],[1,0],[1,1],[0,1]);

const posAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer);
const nrmAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer);
const uvAcc = doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer);
const idxAcc = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer);

const glyph = fs.readFileSync('data/facade.png');
const tex = doc.createTexture().setImage(glyph).setMimeType('image/png');
const sampler = doc.createSampler().setWrapS(10497).setWrapT(10497).setMagFilter(9729).setMinFilter(9987);
tex.setSampler(sampler);
const mat = doc.createMaterial().setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.9);

const prim = doc.createPrimitive()
  .setAttribute('POSITION', posAcc)
  .setAttribute('NORMAL', nrmAcc)
  .setAttribute('TEXCOORD_0', uvAcc)
  .setIndices(idxAcc)
  .setMaterial(mat);
const mesh = doc.createMesh().addPrimitive(prim);
const node = doc.createNode().setMesh(mesh).setScale([1, 1, 1]);
doc.createScene().addChild(node);

await new NodeIO().write('data/test-building.glb', doc);
console.log('written', (fs.statSync('data/test-building.glb').size/1024).toFixed(1), 'KB');

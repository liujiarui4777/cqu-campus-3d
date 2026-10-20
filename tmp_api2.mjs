import { Document } from '@gltf-transform/core';
const doc = new Document();
const tex = doc.createTexture();
const names = [];
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(tex))) {
  if (typeof tex[k] === 'function') names.push(k);
}
console.log('Texture methods:', names.join(','));
const mat = doc.createMaterial();
const mnames = [];
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(mat))) {
  if (typeof mat[k] === 'function') mnames.push(k);
}
console.log('Material methods:', mnames.slice(0, 24).join(','));

import { Document } from '@gltf-transform/core';
const doc = new Document();
const mat = doc.createMaterial();
const info = mat.getBaseColorTextureInfo();
const names = [];
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(info))) {
  if (typeof info[k] === 'function') names.push(k);
}
console.log('TextureInfo methods:', names.join(','));

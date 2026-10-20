import { Document } from '@gltf-transform/core';
const doc = new Document();
const names = [];
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(doc))) {
  if (typeof doc[k] === 'function') names.push(k);
}
console.log(names.join(','));
console.log('version:', (await import('@gltf-transform/core/package.json', {with:{type:'json'}})).default.version);

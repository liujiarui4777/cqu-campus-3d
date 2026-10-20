const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace("import { addLandmarks } from './landmarks.js';","import { addLandmarks } from './landmarks.js';\nimport { createBasemapProvider } from './basemap.js';");
const old = `    const m = terrain.meta;
    const imagery = new Cesium.SingleTileImageryProvider({
      url: BASE + 'data/basemap.jpg',
      rectangle: Cesium.Rectangle.fromDegrees(m.west, m.south, m.east, m.north),
      tileWidth: 1024,
      tileHeight: 1024,
    });
    viewer.scene.imageryLayers.addImageryProvider(imagery);`;
const neu = `    const basemap = await createBasemapProvider(BASE, Cesium, terrain.meta);
    viewer.scene.imageryLayers.addImageryProvider(basemap);`;
if(!s.includes(old)) { console.log('PATTERN NOT FOUND'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync('src/app.js',s);
console.log('patched');

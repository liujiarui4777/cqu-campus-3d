const fs=require('fs');
let b=fs.readFileSync('src/basemap.js','utf8');
b=b.replace("export async function createBasemapProvider(base, Cesium, meta) {","export async function createBasemapProvider(base, Cesium, meta, file = 'basemap.jpg') {");
b=b.replace(/i\.src = `\$\{base\}data\/basemap\.jpg`;/, "i.src = `${base}data/${file}`;");
b=b.replace(/i\.onerror = \(\) => reject\(new Error\('底图 basemap\.jpg 加载失败'\)\);/, "i.onerror = () => reject(new Error('底图加载失败：' + file));");
fs.writeFileSync('src/basemap.js', b);

let s=fs.readFileSync('src/app.js','utf8');
const old = `    const basemap = await createBasemapProvider(BASE, Cesium, terrain.meta);
    viewer.scene.imageryLayers.addImageryProvider(basemap);`;
const neu = `    const coarseMeta = await fetch(BASE + 'data/terrain_coarse.json').then((r) => r.json());
    const coarseMap = await createBasemapProvider(BASE, Cesium, coarseMeta, 'basemap_coarse.jpg');
    viewer.scene.imageryLayers.addImageryProvider(coarseMap);
    const basemap = await createBasemapProvider(BASE, Cesium, terrain.meta, 'basemap.jpg');
    viewer.scene.imageryLayers.addImageryProvider(basemap);`;
if(!s.includes(old)){ console.log('PATTERN MISSING'); process.exit(1); }
s=s.replace(old,neu);
fs.writeFileSync('src/app.js', s);
console.log('patched');

const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace("import { createBasemapProvider } from './basemap.js';","import { createBasemapProvider } from './basemap.js';\nimport { initInteraction } from './ui.js';");
s=s.replace("    window.__CQU__ = { viewer, data, terrain };","    initInteraction(viewer, data, terrain);\n    window.__CQU__ = { viewer, data, terrain };");
fs.writeFileSync('src/app.js',s);
console.log('ok');

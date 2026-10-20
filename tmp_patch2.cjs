const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace("import { addAreas, addRoads, addBuildings, addBoundary } from './build.js';","import { addAreas, addRoads, addBuildings, addBoundary } from './build.js';\nimport { addLandmarks } from './landmarks.js';");
s=s.replace("    if (!only || only === 'boundary') addBoundary(viewer, data, terrain);","    if (!only || only === 'landmarks') addLandmarks(viewer, data, terrain);\n    if (!only || only === 'boundary') addBoundary(viewer, data, terrain);");
fs.writeFileSync('src/app.js',s);
console.log('ok');

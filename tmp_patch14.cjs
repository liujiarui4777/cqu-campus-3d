const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace("import { initInteraction } from './ui.js';","import { initInteraction } from './ui.js';\nimport { addTrees } from './trees.js';");
s=s.replace("    if (!only || only === 'landmarks') addLandmarks(viewer, data, terrain);","    if (!only || only === 'landmarks') addLandmarks(viewer, data, terrain);\n    if (!only || only === 'trees') window.__treeCount = addTrees(viewer, data, terrain);");
fs.writeFileSync('src/app.js',s);
console.log('ok');

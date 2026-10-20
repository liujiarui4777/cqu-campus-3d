const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace(/globe\.baseColor = Cesium\.Color\.fromCssColorString\('#eef2f6'\);/, "globe.baseColor = Cesium.Color.fromCssColorString('#e9e6de');");
s=s.replace(/scene\.backgroundColor = Cesium\.Color\.fromCssColorString\('#eef2f6'\);/, "scene.backgroundColor = Cesium.Color.fromCssColorString('#e9e6de');");
fs.writeFileSync('src/app.js',s);
console.log('ok');

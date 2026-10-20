const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace(/destination: Cesium\.Cartesian3\.fromDegrees\(CENTER\[0\], CENTER\[1\] - 0\.0032, 1150\),/, "destination: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1] - 0.0052, 1750),");
s=s.replace(/heading: Cesium\.Math\.toRadians\(8\), pitch: Cesium\.Math\.toRadians\(-36\), roll: 0,/, "heading: Cesium.Math.toRadians(6), pitch: Cesium.Math.toRadians(-46), roll: 0,");
fs.writeFileSync('src/app.js',s);
console.log('patched');

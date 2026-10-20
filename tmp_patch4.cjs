const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
s=s.replace(/destination: Cesium\.Cartesian3\.fromDegrees\(CENTER\[0\] \+ 0\.0012, CENTER\[1\] - 0\.0042, 980\),/, "destination: Cesium.Cartesian3.fromDegrees(CENTER[0] + 0.0015, CENTER[1] - 0.0055, 1500),");
s=s.replace(/heading: Cesium\.Math\.toRadians\(14\), pitch: Cesium\.Math\.toRadians\(-42\), roll: 0,/, "heading: Cesium.Math.toRadians(12), pitch: Cesium.Math.toRadians(-45), roll: 0,");
fs.writeFileSync('src/app.js',s);
console.log('ok');

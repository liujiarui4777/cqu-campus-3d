const fs=require('fs');
let s=fs.readFileSync('src/app.js','utf8');
const old1 = `viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1] - 0.0052, 1750),
  orientation: { heading: Cesium.Math.toRadians(6), pitch: Cesium.Math.toRadians(-46), roll: 0 },
});`;
const neu1 = `function overview() {
  const center = Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1] - 0.0006, 250);
  viewer.camera.lookAt(
    center,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(10),
      Cesium.Math.toRadians(-38),
      1350,
    ),
  );
}
overview();`;
if(!s.includes(old1)) { console.log('MISS 1'); } else { s = s.replace(old1, neu1); }
const old2 = `        // 起始视角：A 区全景
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1] - 0.0052, 1750),
          orientation: {
            heading: Cesium.Math.toRadians(6),
            pitch: Cesium.Math.toRadians(-46),
            roll: 0,
          },
        });`;
if(s.includes(old2)) s = s.replace(old2, '');
fs.writeFileSync('src/app.js',s);
console.log('done');

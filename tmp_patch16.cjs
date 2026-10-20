const fs=require('fs');
// 跑道：外圈实心 + 内场覆盖
let s=fs.readFileSync('src/landmarks.js','utf8');
s=s.replace(`        hierarchy: new Cesium.PolygonHierarchy(
          Cesium.Cartesian3.fromDegreesArray(outerPos),
          [new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(innerPos))],
        ),`, `        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(outerPos)),`);
fs.writeFileSync('src/landmarks.js', s);

// 树：共享几何 + 实例矩阵
let t=fs.readFileSync('src/trees.js','utf8');
const oldLoopStart = t.indexOf('  for (const t of kept) {');
const oldLoopEnd = t.indexOf('  viewer.scene.primitives.add(\n    new Cesium.Primitive({\n      geometryInstances: trunks,');
const newLoop = `  const trunkGeo = new Cesium.CylinderGeometry({
    length: 3.4,
    topRadius: 0.18,
    bottomRadius: 0.3,
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });
  const crownGeo = new Cesium.EllipsoidGeometry({
    radii: new Cesium.Cartesian3(2.2, 2.2, 2.7),
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });

  for (const t of kept) {
    const h0 = terrain.sample(t.lon, t.lat);
    const base = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, h0 - 0.3);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(base);

    const tm = Cesium.Matrix4.multiplyByTranslation(enu, new Cesium.Cartesian3(0, 0, 1.7), new Cesium.Matrix4());
    trunks.push(
      new Cesium.GeometryInstance({
        geometry: trunkGeo,
        modelMatrix: tm,
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(trunkColor) },
      }),
    );

    const cm = Cesium.Matrix4.multiplyByTranslation(enu, new Cesium.Cartesian3(0, 0, 4.4), new Cesium.Matrix4());
    crowns.push(
      new Cesium.GeometryInstance({
        geometry: crownGeo,
        modelMatrix: cm,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString(t.s > 1.05 ? '#8aa873' : '#7b9a66'),
          ),
        },
      }),
    );
  }

`;
if(oldLoopStart<0||oldLoopEnd<0){ console.log('tree loop markers missing', oldLoopStart, oldLoopEnd); }
else { t = t.slice(0, oldLoopStart) + newLoop + t.slice(oldLoopEnd); fs.writeFileSync('src/trees.js', t); console.log('trees patched'); }

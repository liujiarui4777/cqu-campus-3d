const fs=require('fs');
let s=fs.readFileSync('src/landmarks.js','utf8');
const oldStart = s.indexOf('    const ringPts = trackRing(R, L, W, 28);');
const oldEnd = s.indexOf('    // 内场足球场');
if(oldStart<0||oldEnd<0){ console.log('missing'); process.exit(1); }
const neu = `    // 外圈与内圈分成两个环，用带洞多边形，避免自交
    const outerPts = trackRing(R, L, W, 28, true);
    const innerPts = trackRing(R, L, W, 28, false);
    const outerDeg = outerPts.map(([x, y]) => {
      const [rx, ry] = rotate(x, y, bearing);
      return offset(clon, clat, rx, ry);
    });
    const innerDeg = innerPts.map(([x, y]) => {
      const [rx, ry] = rotate(x, y, bearing);
      return offset(clon, clat, rx, ry);
    });
    const outerPos = [];
    for (const [lo, la] of outerDeg) outerPos.push(lo, la);
    const innerPos = [];
    for (const [lo, la] of innerDeg) innerPos.push(lo, la);
    E.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(
          Cesium.Cartesian3.fromDegreesArray(outerPos),
          [new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(innerPos))],
        ),
        height: h0 + 0.26,
        material: cr('#b4573f'),
      },
      properties: { kind: 'landmark', name: '思群广场 400m 跑道' },
    });
`;
s = s.slice(0, oldStart) + neu + s.slice(oldEnd);
// 替换 trackRing 实现
const tStart = s.indexOf('function trackRing(R, L, width, N) {');
const tEnd = s.indexOf('function rotate(x, y, a) {');
const newFn = `function trackRing(R, L, width, N, outer) {
  const r = outer ? R + width : R;
  const half = L / 2;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / N;
    pts.push([half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([-half, r]);
  for (let i = 0; i <= N; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / N;
    pts.push([-half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([half, -r]);
  return pts;
}

`;
s = s.slice(0, tStart) + newFn + s.slice(tEnd);
fs.writeFileSync('src/landmarks.js', s);
console.log('ok');

const fs=require('fs');
let s=fs.readFileSync('src/landmarks.js','utf8');
const start = s.indexOf('  /* ---------- 思群广场：400m 标准跑道 ---------- */');
const end = s.indexOf('/* 400m 半圆式跑道的"跑道带"外沿 / 内沿线');
if(start<0||end<0){ console.log('markers missing', start, end); process.exit(1); }
const fresh = `  /* ---------- 思群广场：400m 标准跑道 ---------- */
  const track = data.track;
  if (track) {
    const [clon, clat] = track.center;
    const h0 = terrain.sample(clon, clat);
    const bearing = (track.bearing || 0) * (Math.PI / 180);
    // 400m 半圆式：直道 84.39m、弯道半径 36.5m、道宽 9.76m（8 道）
    const R = 36.5;
    const L = 84.39;
    const W = 9.76;
    const ringPts = trackRing(R, L, W, 28);
    const geo = ringPts.map(([x, y]) => {
      const [rx, ry] = rotate(x, y, bearing);
      return offset(clon, clat, rx, ry);
    });
    E.add({
      polygon: {
        hierarchy: polygonPoints(Cesium, geo),
        height: h0 + 0.25,
        material: cr('#b4573f'),
      },
      properties: { kind: 'landmark', name: '思群广场 400m 跑道' },
    });
    // 内场足球场（105 × 68），比跑道略高一点
    const field = [];
    const fw = 34;
    const fl = 52.5;
    for (const [x, y] of [[-fl, -fw], [fl, -fw], [fl, fw], [-fl, fw]]) {
      const [rx, ry] = rotate(x, y, bearing);
      field.push(offset(clon, clat, rx, ry));
    }
    E.add({
      polygon: {
        hierarchy: polygonPoints(Cesium, field),
        height: h0 + 0.36,
        material: cr('#6f9a5e'),
      },
      properties: { kind: 'landmark', name: '思群广场足球场' },
    });
  }
}

/* 生成 400m 环形跑道带的多边形（局部坐标，x 东 y 北） */
function trackRing(R, L, width, N) {
  const r0 = R;
  const r1 = R + width;
  const half = L / 2;
  const outer = [];
  const inner = [];
  // 右半圆
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / N;
    outer.push([half + Math.cos(a) * r1, Math.sin(a) * r1]);
    inner.push([half + Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  // 上直道（左向）
  outer.push([-half, r1]);
  inner.push([-half, r0]);
  // 左半圆
  for (let i = 0; i <= N; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / N;
    outer.push([-half + Math.cos(a) * r1, Math.sin(a) * r1]);
    inner.push([-half + Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  // 下直道（右向）
  outer.push([half, -r1]);
  inner.push([half, -r0]);
  const pts = outer.slice();
  for (let i = inner.length - 1; i >= 0; i--) pts.push(inner[i]);
  return pts;
}

`;
s = s.slice(0, start) + fresh + s.slice(end);
// 去掉旧的 trackPolyline 尾部定义
s = s.replace(/\/\* 400m 半圆式跑道的[\s\S]*?function rotate\(x, y, a\) \{/, 'function rotate(x, y, a) {');
fs.writeFileSync('src/landmarks.js', s);
console.log('ok, file len', s.length);

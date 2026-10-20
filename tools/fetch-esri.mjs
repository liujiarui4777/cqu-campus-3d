import fs from 'node:fs';
const BBOX = { west: 106.4445, south: 29.5500, east: 106.4790, north: 29.5805 };
const bboxStr = `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`;
for (const size of [4096, 3072, 2048]) {
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bboxStr}&bboxSR=4326&imageSR=4326&size=${size},${size}&format=jpg&f=image&interpolation=RSP_BilinearInterpolation`;
  try {
    const t0 = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(`size=${size} status=${r.status} bytes=${(buf.length / 1024 / 1024).toFixed(2)}MB ms=${Date.now() - t0}`);
    if (r.ok && buf.length > 200000) {
      fs.writeFileSync('data/esri.jpg', buf);
      console.log('saved data/esri.jpg');
      break;
    }
  } catch (e) {
    console.log(`size=${size} ERR`, e.message);
  }
}

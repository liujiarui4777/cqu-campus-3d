import fs from 'node:fs';
const q = `[out:json][timeout:60];
way["building"](29.553,106.448,29.585,106.483);
out geom;`;
const r = await fetch("https://overpass-api.de/api/interpreter", {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cqu-campus-3d/0.2' },
  body: 'data=' + encodeURIComponent(q),
  signal: AbortSignal.timeout(80000),
});
const t = await r.text();
console.log('status', r.status, t.length);
if (r.ok) {
  fs.writeFileSync('data/raw/osm-surroundings.json', t);
  const j = JSON.parse(t);
  console.log('buildings:', j.elements.length);
  const withLevels = j.elements.filter(e => e.tags && e.tags['building:levels']).length;
  console.log('with levels:', withLevels);
}

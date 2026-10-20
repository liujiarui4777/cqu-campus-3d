const q = `[out:json][timeout:60];
way["building"](29.553,106.448,29.585,106.483);
out geom;`;
const urls = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.osm.ch/api/interpreter"];
(async () => {
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cqu-campus-3d/0.2' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(70000),
      });
      const t = await r.text();
      console.log(u, r.status, t.length);
      if (r.ok) {
        require('fs').writeFileSync('data/raw/osm-surroundings.json', t);
        console.log('buildings:', JSON.parse(t).elements.length);
        break;
      }
    } catch (e) { console.log(u, 'ERR', e.message.slice(0,60)); }
  }
})();

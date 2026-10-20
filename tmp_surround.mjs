const q = `[out:json][timeout:120];
(
  way["building"](29.548,106.442,29.588,106.492);
);
out geom;`;
const urls = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
(async () => {
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cqu-campus-3d/0.2 (student project)' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(100000),
      });
      const t = await r.text();
      console.log(u, r.status, t.length);
      if (r.ok) {
        require('fs').writeFileSync('data/raw/osm-surroundings.json', t);
        const j = JSON.parse(t);
        console.log('buildings:', j.elements.length);
        break;
      }
    } catch (e) { console.log(u, 'ERR', e.message); }
  }
})();

const q = `[out:json][timeout:90];
(
  way["natural"="water"](29.48,106.38,29.68,106.58);
  relation["natural"="water"](29.48,106.38,29.68,106.58);
);
out geom;`;
const urls = ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
(async()=>{
  for(const u of urls){
    try{
      const r = await fetch(u, {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:'data='+encodeURIComponent(q), signal: AbortSignal.timeout(60000)});
      const t = await r.text();
      console.log(u, r.status, t.length);
      if(r.ok){ require('fs').writeFileSync('tmp/water_wide.json', t); const j=JSON.parse(t); console.log('elements', j.elements.length); break; }
      else console.log(t.slice(0,200));
    }catch(e){ console.log(u,'ERR',e.message); }
  }
})();

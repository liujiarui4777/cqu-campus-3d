const q = `[out:json][timeout:90];
(
  way["natural"="water"](29.48,106.38,29.68,106.58);
  relation["natural"="water"](29.48,106.38,29.68,106.58);
);
out geom;`;
const u = "https://overpass-api.de/api/interpreter";
(async()=>{
  try{
    const r = await fetch(u, {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'cqu-campus-3d/0.1 (student project)'}, body:'data='+encodeURIComponent(q), signal: AbortSignal.timeout(90000)});
    const t = await r.text();
    console.log(r.status, t.length);
    if(r.ok){ require('fs').writeFileSync('tmp/water_wide.json', t); const j=JSON.parse(t); console.log('elements', j.elements.length); }
    else console.log(t.slice(0,300));
  }catch(e){ console.log('ERR',e.message); }
})();

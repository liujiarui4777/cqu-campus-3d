const fs=require("fs");
const B=JSON.parse(fs.readFileSync("data/raw/osm-buildings.json","utf8")).elements;
const rows=B.map(b=>{const t=b.tags||{};const g=b.geometry||[];const c=g.reduce((a,p)=>[a[0]+p.lon/g.length,a[1]+p.lat/g.length],[0,0]);return {id:b.id,name:t.name||"",lv:t["building:levels"]||"",h:t.height||"",bl:t.building,c,pts:g.length};});
rows.sort((a,b)=>b.pts-a.pts);
for(const r of rows.slice(0,40)) console.log(r.id, "|", (r.name||"-").padEnd(14), "| lv:", r.lv||"-", "| h:", r.h||"-", "|", r.bl, "|", r.c[0].toFixed(5)+","+r.c[1].toFixed(5), "| pts", r.pts);

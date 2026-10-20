const fs=require("fs");
const A=JSON.parse(fs.readFileSync("data/raw/osm-areas.json","utf8")).elements;
console.log("=== areas ===");
for(const a of A){ const t=a.tags||{}; console.log(a.id, "|", t.name||"-", "|", Object.entries(t).filter(([k])=>["natural","water","leisure","landuse","amenity","sport","surface"].includes(k)).map(([k,v])=>k+"="+v).join(" "), "| pts:", (a.geometry||[]).length); }
const C=JSON.parse(fs.readFileSync("data/raw/osm-campus.json","utf8")).elements;
console.log("=== campus types ===");
const cnt={}; for(const c of C){ const t=c.tags||{}; const k=[t.building?"bldg":null, t.amenity?"amenity:"+t.amenity:null, t.leisure?"leisure:"+t.leisure:null, t.highway?"hw:"+t.highway:null, t.natural?"nat:"+t.natural:null, t.landuse?"lu:"+t.landuse:null].filter(Boolean).join(",")||"other"; cnt[k]=(cnt[k]||0)+1; }
console.log(Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([k,v])=>v+" "+k).join("\n"));

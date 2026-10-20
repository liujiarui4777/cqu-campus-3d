const fs=require("fs");
for(const f of ["osm-buildings","osm-areas","osm-roads","osm-amenities","osm-campus"]){
  const j=JSON.parse(fs.readFileSync(`data/raw/${f}.json`,"utf8"));
  const els=j.elements||j;
  const s=els[0];
  console.log(f, "count:", els.length, "| keys:", Object.keys(s).join(","));
  if(s.geometry) console.log("   geom0:", JSON.stringify(s.geometry[0]), "type:", s.type);
  if(s.members) console.log("   members:", s.members.length);
}

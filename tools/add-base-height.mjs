import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync('data/scene.json','utf8'));
const t = JSON.parse(fs.readFileSync('data/terrain.json','utf8'));
const W=t.width,H=t.height,k=t.scale||0.1;
const buf = fs.readFileSync('data/terrain.bin');
const q = new Int16Array(buf.buffer, buf.byteOffset, buf.length/2);
function sample(lon,lat){
  const fx=((lon-t.west)/(t.east-t.west))*(W-1);
  const fy=((t.north-lat)/(t.north-t.south))*(H-1);
  const x0=Math.max(0,Math.min(W-1,Math.floor(fx))), y0=Math.max(0,Math.min(H-1,Math.floor(fy)));
  const tx=fx-x0, ty=fy-y0;
  const at=(c,r)=>{c=Math.max(0,Math.min(W-1,c));r=Math.max(0,Math.min(H-1,r));return q[r*W+c]*k;};
  return at(x0,y0)*(1-tx)*(1-ty)+at(x0+1,y0)*tx*(1-ty)+at(x0,y0+1)*(1-tx)*ty+at(x0+1,y0+1)*tx*ty;
}
for(const b of s.buildings){ b.baseHeight = Math.round(sample(b.center[0], b.center[1])*10)/10; }
fs.writeFileSync('data/scene.json', JSON.stringify(s));
console.log('baseHeight added', s.buildings.length, 'e.g.', s.buildings[0].baseHeight);

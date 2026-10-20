(async()=>{
  const base='https://liujiarui4777.github.io/cqu-campus-3d-site/';
  for (const f of ['data/terrain.json','data/terrain.bin','data/terrain_coarse.bin','data/basemap.jpg','data/basemap_coarse.jpg','cesium/Cesium.js']) {
    try { const r = await fetch(base+f, {method:'GET', signal: AbortSignal.timeout(60000)}); const b = await r.arrayBuffer(); console.log(f, r.status, (b.byteLength/1024).toFixed(0)+'KB'); }
    catch(e){ console.log(f,'ERR',e.message); }
  }
})();

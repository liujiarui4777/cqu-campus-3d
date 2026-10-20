(async()=>{
  const urls = ["https://liujiarui4777.github.io/cqu-campus-3d-site/", "https://liujiarui4777.github.io/cqu-campus-3d-site/data/scene.json"];
  for (const u of urls) {
    try { const r = await fetch(u, {signal: AbortSignal.timeout(30000)}); const t = await r.text(); console.log(u, r.status, t.length); }
    catch(e){ console.log(u, 'ERR', e.message); }
  }
})();

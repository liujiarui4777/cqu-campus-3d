// 为每栋建筑生成 3D 示意图（信息卡用）
// 依赖：本地 5181 页面已打开、browser-agent 常驻 Edge（9333）
// 用法：node tools/gen-building-shots.cjs
const fs = require('fs');
const path = require('path');
const puppeteer = require('D:/User_Data/Desktop/browser-agent/node_modules/puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'imgs');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333' });
  const pages = await browser.pages();
  const page = pages.find((x) => x.url().includes('127.0.0.1:5181'));
  if (!page) {
    console.log(JSON.stringify({ ok: false, err: 'PAGE_NOT_FOUND', pages: pages.map((x) => x.url()) }));
    process.exit(1);
  }
  await page.bringToFront();
  await page.setViewport({ width: 640, height: 420 });
  await page.evaluate(() => {
    if (!window.__CQU__) throw new Error('scene not ready');
    document.body.classList.add('capture');
  });
  const list = await page.evaluate(() =>
    window.__CQU__.data.buildings.map((b) => ({
      id: b.id,
      lon: b.center[0],
      lat: b.center[1],
      h: b.height || 12,
    })),
  );
  console.log('buildings', list.length);

  let done = 0;
  for (const b of list) {
    await page.evaluate((bb) => {
      const C = window.Cesium;
      const v = window.__CQU__.viewer;
      const h0 = window.__CQU__.terrain.sample(bb.lon, bb.lat);
      const center = C.Cartesian3.fromDegrees(bb.lon, bb.lat, h0 + bb.h * 0.45);
      const range = Math.max(130, bb.h * 2.9);
      v.camera.lookAtTransform(C.Matrix4.IDENTITY);
      v.camera.lookAt(center, new C.HeadingPitchRange(C.Math.toRadians(35), C.Math.toRadians(-18), range));
    }, b);
    await new Promise((r) => setTimeout(r, 280));
    await page.screenshot({ path: path.join(OUT, b.id + '.jpg'), type: 'jpeg', quality: 72 });
    done++;
    if (done % 20 === 0) console.log('done', done);
  }

  await page.evaluate(() => document.body.classList.remove('capture'));
  const n = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length;
  const size = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(JSON.stringify({ ok: true, count: n, MB: (size / 1024 / 1024).toFixed(1) }));
  await browser.disconnect();
})();



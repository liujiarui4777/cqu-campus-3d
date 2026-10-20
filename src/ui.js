/* 交互：点击建筑 → 信息卡；地标导览；昼夜主题 */

const Cesium = window.Cesium;

const KIND_LABEL = {
  teach: '教学科研',
  dorm: '学生宿舍',
  library: '图书馆',
  canteen: '食堂',
  sport: '体育场馆',
  office: '办公',
  other: '建筑',
  landmark: '地标',
};

export function initInteraction(viewer, data, terrain) {
  const card = document.getElementById('card');
  const cardTitle = document.getElementById('card-title');
  const cardSub = document.getElementById('card-sub');
  const cardMeta = document.getElementById('card-meta');
  const cardDesc = document.getElementById('card-desc');
  const cardTags = document.getElementById('card-tags');

  let current = null;

  function hide() {
    card.classList.remove('show');
    current = null;
    if (viewer.scene.canvas) viewer.scene.canvas.style.cursor = 'grab';
  }

  function show(entity) {
    const props = entity.properties;
    if (!props) return;
    const b = props.data.getValue();
    if (!b) return;
    current = b;

    cardTitle.textContent = b.name || '未命名建筑';
    cardSub.textContent = b.alias || (b.landmark ? '校园地标' : '');
    const kind = KIND_LABEL[b.kind] || '建筑';
    cardMeta.innerHTML = `
      <span>${kind}</span>
      <span>${b.levels} 层</span>
      <span>约 ${b.height} m</span>
      ${b.area ? `<span>基底 ${b.area.toLocaleString()} m²</span>` : ''}
    `;
    cardDesc.textContent = b.desc || '';
    cardDesc.style.display = b.desc ? 'block' : 'none';

    cardTags.innerHTML = '';
    if (b.landmark) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = '重点建筑';
      cardTags.appendChild(t);
    }
    if (b.roof === 'hip' || b.roof === 'gable') {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = '坡屋顶';
      cardTags.appendChild(t);
    }

    card.classList.add('show');

    // 相机飞到该建筑
    const h0 = terrain.sample(b.center[0], b.center[1]);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        b.center[0] - 0.0016,
        b.center[1] - 0.0016,
        h0 + Math.max(90, b.height * 1.8 + 60),
      ),
      orientation: {
        heading: Cesium.Math.toRadians(35),
        pitch: Cesium.Math.toRadians(-32),
        roll: 0,
      },
      duration: 1.5,
    });
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (Cesium.defined(picked) && picked.id && picked.id.properties) {
      show(picked.id);
    } else {
      hide();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById('card-close').addEventListener('click', hide);
  viewer.scene.canvas.addEventListener('mousemove', (e) => {
    const picked = viewer.scene.pick(new Cesium.Cartesian2(e.offsetX, e.offsetY));
    const hit = Cesium.defined(picked) && picked.id && picked.id.properties;
    viewer.scene.canvas.style.cursor = hit ? 'pointer' : 'grab';
  });

  /* ---------- 地标导览 ---------- */
  const guide = [
    { name: '主教学楼', lon: 106.46655, lat: 29.5684, h: 165, pitch: -30 },
    { name: '钟塔', lon: 106.4634, lat: 29.56991, h: 70, pitch: -22 },
    { name: '大校门', lon: 106.46, lat: 29.5695, h: 55, pitch: -20 },
    { name: '民主湖', lon: 106.46599, lat: 29.56635, h: 130, pitch: -35 },
    { name: '风雨操场', lon: 106.46852, lat: 29.56692, h: 120, pitch: -32 },
    { name: '思群广场', lon: 106.46433, lat: 29.56698, h: 180, pitch: -38 },
    { name: '老图书馆', lon: 106.46616, lat: 29.56926, h: 90, pitch: -28 },
    { name: '寅初亭', lon: 106.4633, lat: 29.5687, h: 70, pitch: -26 },
  ];
  const nav = document.getElementById('guides');
  if (nav) {
    for (const g of guide) {
      const b = document.createElement('button');
      b.className = 'guide-btn';
      b.textContent = g.name;
      b.addEventListener('click', () => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(g.lon - 0.0011, g.lat - 0.0014, g.h + 260),
          orientation: {
            heading: Cesium.Math.toRadians(20),
            pitch: Cesium.Math.toRadians(g.pitch),
            roll: 0,
          },
          duration: 1.6,
        });
      });
      nav.appendChild(b);
    }
  }

  /* ---------- 昼夜 ---------- */
  const root = document.documentElement;
  document.querySelectorAll('[data-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-time]').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.getAttribute('data-time');
      root.setAttribute('data-theme', t);
      const bg =
        t === 'night' ? '#0e1520' : t === 'dusk' ? '#26324a' : '#e9e6de';
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(bg);
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(bg);
    });
  });

  /* ---------- 搜索 ---------- */
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const all = data.buildings || [];

  function renderResults(q) {
    results.innerHTML = '';
    if (!q) {
      results.classList.remove('show');
      return;
    }
    const lower = q.toLowerCase();
    const hits = all
      .filter((b) => {
        const n = (b.name || '').toLowerCase();
        return n.includes(lower) || (b.desc || '').toLowerCase().includes(lower);
      })
      .slice(0, 8);
    if (!hits.length) {
      results.innerHTML = '<div class="sr-empty">没有找到相关建筑</div>';
      results.classList.add('show');
      return;
    }
    for (const b of hits) {
      const btn = document.createElement('button');
      btn.className = 'sr-item';
      btn.innerHTML = '<span>' + (b.name || '未命名') + '</span><em>' + b.levels + ' 层 · ' + b.height + ' m</em>';
      btn.addEventListener('click', () => {
        results.classList.remove('show');
        input.value = b.name || '';
        show({ properties: { data: { getValue: () => b } } });
      });
      results.appendChild(btn);
    }
    results.classList.add('show');
  }

  if (input) {
    input.addEventListener('input', (e) => renderResults(e.target.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = results.querySelector('.sr-item');
        if (first) first.click();
      }
      if (e.key === 'Escape') {
        input.value = '';
        renderResults('');
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search')) results.classList.remove('show');
    });
  }

  return { hide };
}

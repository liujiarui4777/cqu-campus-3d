const fs=require('fs');
let u=fs.readFileSync('src/ui.js','utf8');
const anchor = '  return { hide };';
if(!u.includes(anchor)) { console.log('anchor missing'); process.exit(1); }
const searchCode = `  /* ---------- 搜索 ---------- */
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

`;
u = u.replace(anchor, searchCode + anchor);
fs.writeFileSync('src/ui.js', u);

// 样式
let c=fs.readFileSync('src/style.css','utf8');
if(!c.includes('.search {')){
  c += `

/* ---------- 搜索 ---------- */
.search {
  position: absolute;
  left: 50%;
  top: 22px;
  transform: translateX(-50%);
  width: 320px;
  z-index: 15;
}
.search input {
  width: 100%;
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  backdrop-filter: blur(10px);
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  padding: 9px 16px;
  outline: none;
  letter-spacing: 0.03em;
  box-shadow: 0 2px 12px rgba(31, 42, 51, 0.06);
}
.search input:focus { border-color: var(--accent); }
.search-results {
  display: none;
  margin-top: 8px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.search-results.show { display: block; }
.sr-item {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid rgba(31, 42, 51, 0.06);
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  padding: 9px 14px;
  cursor: pointer;
  text-align: left;
}
.sr-item:last-child { border-bottom: 0; }
.sr-item:hover { background: var(--accent-soft); }
.sr-item em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.sr-empty { padding: 10px 14px; font-size: 12.5px; color: var(--muted); }
`;
  fs.writeFileSync('src/style.css', c);
}
console.log('ok');

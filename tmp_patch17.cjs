const fs=require('fs');
// 1) 去掉重复的足球场（OSM 已有）
let l=fs.readFileSync('src/landmarks.js','utf8');
const fStart = l.indexOf('    // 内场足球场（105 × 68）');
const fEnd = l.indexOf('  }\n}\n\n/* 生成 400m 环形跑道带');
if(fStart>0 && fEnd>0){ l = l.slice(0,fStart) + l.slice(fEnd); fs.writeFileSync('src/landmarks.js', l); console.log('field removed'); }
else console.log('field markers', fStart, fEnd);

// 2) index.html 加搜索框
let h=fs.readFileSync('index.html','utf8');
if(!h.includes('id="search-input"')){
  h=h.replace('    <div class="guides" id="guides"></div>', `    <div class="search">
      <input id="search-input" type="search" placeholder="搜索建筑：主教 / 民主湖 / 图书馆…" autocomplete="off" />
      <div class="search-results" id="search-results"></div>
    </div>

    <div class="guides" id="guides"></div>`);
  fs.writeFileSync('index.html', h);
  console.log('search html added');
}

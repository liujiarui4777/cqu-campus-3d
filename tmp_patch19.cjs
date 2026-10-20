const fs=require('fs');
let h=fs.readFileSync('index.html','utf8');
if(!h.includes('credit-line')){
  h=h.replace('<footer class="hint">点击建筑查看详情 · 左键拖拽旋转 · 滚轮缩放 · 右键平移</footer>',
`<footer class="hint">
      点击建筑查看详情 · 左键拖拽旋转 · 滚轮缩放 · 右键平移
      <span class="credit-line">建筑轮廓 © OpenStreetMap 贡献者（ODbL） · 地形 AWS Terrain Tiles · 考据：重庆市文旅委 / 重庆大学公开资料</span>
    </footer>`);
  fs.writeFileSync('index.html', h);
  let c=fs.readFileSync('src/style.css','utf8');
  c += `

.credit-line {
  display: block;
  margin-top: 6px;
  font-size: 10.5px;
  color: rgba(93, 107, 120, 0.75);
  letter-spacing: 0.02em;
}
`;
  fs.writeFileSync('src/style.css', c);
  console.log('credit added');
}

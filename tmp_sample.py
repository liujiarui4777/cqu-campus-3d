# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np

# 用 OSM 已知点去影像上采样，确认各类地物的颜色
img = Image.open('tmp/esri_mosaic.jpg').convert('RGB')
a = np.asarray(img).astype(np.float32)
h, w, _ = a.shape

# 影像范围（Web Mercator 瓦片拼接后的近似线性映射）
WEST, SOUTH, EAST, NORTH = 106.4500, 29.5530, 106.4800, 29.5820
def px(lon, lat):
    x = (lon - WEST) / (EAST - WEST) * w
    y = (NORTH - lat) / (NORTH - SOUTH) * h
    return int(x), int(y)

samples = {
  '嘉陵江': (106.4700, 29.5780),
  '民主湖': (106.46596, 29.56637),
  '田径场草坪': (106.46433, 29.56698),
  '主教屋顶': (106.46655, 29.56840),
  '道路(沙正街)': (106.4598, 29.5695),
  '树丛(松林坡)': (106.4625, 29.5720),
  '宿舍区屋顶': (106.4640, 29.5645),
}
for name, (lon, lat) in samples.items():
    x, y = px(lon, lat)
    patch = a[max(0,y-3):y+4, max(0,x-3):x+4].reshape(-1,3)
    med = np.median(patch, axis=0)
    print(f'{name:12s} px=({x},{y}) RGB={[int(v) for v in med]}')

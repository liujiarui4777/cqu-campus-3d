# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np, math, json

img = Image.open('tmp/esri_mosaic.jpg').convert('RGB')
a = np.asarray(img).astype(np.float32)
meta = json.load(open('tmp/esri_meta.json'))
Z, x0t, y0t = meta['z'], meta['x0'], meta['y0']
def lon2x(lon, z): return (lon + 180.0) / 360.0 * (1 << z)
def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)
def px(lon, lat):
    return int((lon2x(lon, Z) - x0t) * 256), int((lat2y(lat, Z) - y0t) * 256)

R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]
ExG = 2*G - R - B
V = (R + G + B) / 3

# 校园范围
x1,y1 = px(106.4590, 29.5735); x2,y2 = px(106.4720, 29.5620)
sub_exg = ExG[y1:y2, x1:x2]
sub_v = V[y1:y2, x1:x2]
print('campus ExG percentiles:', [int(np.percentile(sub_exg, p)) for p in (10,25,50,75,90)])
print('campus V   percentiles:', [int(np.percentile(sub_v, p)) for p in (10,25,50,75,90)])

def stat(name, lon, lat, r=4):
    x, y = px(lon, lat)
    e = ExG[y-r:y+r+1, x-r:x+r+1].mean()
    v = V[y-r:y+r+1, x-r:x+r+1].mean()
    rgb = a[y-r:y+r+1, x-r:x+r+1].reshape(-1,3).mean(axis=0)
    print(f'{name:14s} ExG={e:6.1f} V={v:6.1f} RGB={[int(t) for t in rgb]}')

stat('江水', 106.4700, 29.5780)
stat('民主湖', 106.46596, 29.56637)
stat('田径场草坪', 106.46433, 29.56698)
stat('主教屋顶', 106.46655, 29.56840)
stat('主干道', 106.4598, 29.5695)
stat('宿舍屋顶', 106.4640, 29.5645)
stat('树丛(西北)', 106.4605, 29.5725)
stat('树丛(湖边)', 106.4665, 29.5655)

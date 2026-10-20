# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np, math, json

img = Image.open('tmp/esri_mosaic.jpg').convert('RGB')
a = np.asarray(img).astype(np.float32)
h, w, _ = a.shape
meta = json.load(open('tmp/esri_meta.json'))
Z, x0t, y0t = meta['z'], meta['x0'], meta['y0']

def lon2x(lon, z): return (lon + 180.0) / 360.0 * (1 << z)
def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)

def px(lon, lat):
    return int((lon2x(lon, Z) - x0t) * 256), int((lat2y(lat, Z) - y0t) * 256)

samples = {
  'jiang': (106.4700, 29.5780),
  'lake': (106.46596, 29.56637),
  'track': (106.46433, 29.56698),
  'mainbldg': (106.46655, 29.56840),
  'road': (106.4598, 29.5695),
  'trees': (106.4625, 29.5720),
  'dorm': (106.4640, 29.5645),
}
for name, (lon, lat) in samples.items():
    x, y = px(lon, lat)
    if not (0 <= x < w and 0 <= y < h):
        print(name, 'out of image', x, y); continue
    patch = a[max(0,y-3):y+4, max(0,x-3):x+4].reshape(-1,3)
    med = np.median(patch, axis=0)
    print(f'{name:10s} px=({x},{y}) RGB={[int(v) for v in med]}')

# -*- coding: utf-8 -*-
# 把 Mercator 影像重采样成等经纬度网格，供 Cesium 自定义 provider 使用
from PIL import Image
import numpy as np, math, json

img = Image.open('tmp/esri_mosaic.jpg').convert('RGB')
a = np.asarray(img)
h, w, _ = a.shape
meta = json.load(open('tmp/esri_meta.json'))
Z, x0t, y0t = meta['z'], meta['x0'], meta['y0']
def lon2x(lon, z): return (lon + 180.0) / 360.0 * (1 << z)
def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)

base = json.load(open('data/terrain.json', encoding='utf-8'))
W, H = base['width'], base['height']
west, south, east, north = base['west'], base['south'], base['east'], base['north']

jj, ii = np.meshgrid(np.arange(W), np.arange(H))
lon = west + (jj + 0.5) / W * (east - west)
lat = north - (ii + 0.5) / H * (north - south)
X = np.clip(np.round((np.array([lon2x(v, Z) for v in lon[0]]) - x0t) * 256).astype(int), 0, w-1)
Y = np.clip(np.round((np.array([lat2y(v, Z) for v in lat[:, 0]]) - y0t) * 256).astype(int), 0, h-1)
out = a[np.ix_(Y, X)]
Image.fromarray(out).save('data/esri.jpg', quality=82)
print('esri.jpg', out.shape)

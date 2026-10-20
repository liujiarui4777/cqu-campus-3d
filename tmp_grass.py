# -*- coding: utf-8 -*-
# 从卫星影像提取草地掩膜，重采样到 basemap 网格
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

base = json.load(open('data/terrain.json', encoding='utf-8'))
W, H = base['width'], base['height']
west, south, east, north = base['west'], base['south'], base['east'], base['north']

R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]
ExG = 2*G - R - B
V = (R + G + B) / 3
grass = (ExG > 24) & (V > 82) & (V < 140)

# 采样到 basemap 网格
jj, ii = np.meshgrid(np.arange(W), np.arange(H))
lon = west + (jj + 0.5) / W * (east - west)
lat = north - (ii + 0.5) / H * (north - south)

mx = (np.array([lon2x(v, Z) for v in lon[0]]) - x0t) * 256
my = (np.array([lat2y(v, Z) for v in lat[:, 0]]) - y0t) * 256
X = np.clip(np.round(mx).astype(int), 0, w-1)
Y = np.clip(np.round(my).astype(int), 0, h-1)
mask = grass[np.ix_(Y, X)]

out = (mask.astype(np.uint8) * 255)
Image.fromarray(out, 'L').resize((W, H)).save('data/grass-mask.png')
print('grass mask', W, H, 'fill %', round(mask.mean()*100, 1))

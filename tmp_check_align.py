# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw
import numpy as np, math, json

img = Image.open('tmp/esri_mosaic.jpg').convert('RGB')
meta = json.load(open('tmp/esri_meta.json'))
Z, x0t, y0t = meta['z'], meta['x0'], meta['y0']
def lon2x(lon, z): return (lon + 180.0) / 360.0 * (1 << z)
def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)
def px(lon, lat):
    return (lon2x(lon, Z) - x0t) * 256, (lat2y(lat, Z) - y0t) * 256

scene = json.load(open('data/scene.json', encoding='utf-8'))
out = img.copy(); d = ImageDraw.Draw(out)
for b in scene['buildings']:
    pts = [px(lon, lat) for lon, lat in b['outline']]
    if len(pts) >= 3:
        d.polygon(pts, outline=(0, 255, 255), width=2)
for a in scene['areas']:
    if a['kind'] == 'water':
        pts = [px(lon, lat) for lon, lat in a['outline']]
        if len(pts) >= 3:
            d.polygon(pts, outline=(255, 0, 255), width=2)
out.save('tmp/esri_check.jpg', quality=88)
print('saved tmp/esri_check.jpg')

# -*- coding: utf-8 -*-
"""由 DEM + OSM 区域生成单张风格化底图（hillshade + 草地/水面/场地配色）。

输出：public/data/basemap.jpg + basemap.json（含经纬度范围）
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, '..'))
DATA = os.path.join(ROOT, 'data')

with open(os.path.join(DATA, 'terrain.json'), encoding='utf-8') as f:
    meta = json.load(f)
W, H = meta['width'], meta['height']
with open(os.path.join(DATA, 'terrain.bin'), 'rb') as f:
    grid = np.frombuffer(f.read(), dtype=np.int16).astype(np.float32).reshape(H, W) * meta['scale']

west, south, east, north = meta['west'], meta['south'], meta['east'], meta['north']

# ---------- hillshade ----------
dy, dx = np.gradient(grid, 1.0, 1.0)
# 每像素约多少米
mx = (east - west) * 111320 * math.cos(math.radians((north + south) / 2)) / W
my = (north - south) * 110540 / H
slope_x = dx / mx
slope_y = dy / my
az = math.radians(315.0)  # 光从西北
alt = math.radians(42.0)
nx = -slope_x
ny = -slope_y
nz = np.ones_like(nx)
norm = np.sqrt(nx * nx + ny * ny + nz * nz)
nx, ny, nz = nx / norm, ny / norm, nz / norm
lx, ly, lz = math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)
shade = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
# 柔和化：只保留 0.80~1.0 的明暗差，避免脏
shade = 0.80 + 0.20 * shade

# ---------- 底色 ----------
base = np.zeros((H, W, 3), dtype=np.float32)
base[..., 0] = 0xF3
base[..., 1] = 0xEF
base[..., 2] = 0xE6
rgb = base * shade[..., None]

img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
img = img.filter(ImageFilter.GaussianBlur(1.2))

# ---------- 叠加 OSM 区域 ----------
scene_path = os.path.join(DATA, 'scene.json')
if os.path.exists(scene_path):
    with open(scene_path, encoding='utf-8') as f:
        scene = json.load(f)

    def to_px(lon, lat):
        return ((lon - west) / (east - west) * (W - 1), (north - lat) / (north - south) * (H - 1))

    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    colors = {
        'water': (150, 190, 205, 255),
        'river': (163, 200, 214, 255),
        'green': (196, 216, 176, 255),
        'pitch': (168, 196, 150, 255),
    }
    for a in scene.get('areas', []):
        col = colors.get(a['kind'])
        if not col:
            continue
        pts = [to_px(lon, lat) for lon, lat in a['outline']]
        if len(pts) >= 3:
            d.polygon(pts, fill=col)

    # 建筑基底阴影，让楼“站”在地上
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    for b in scene.get('buildings', []):
        pts = [to_px(lon, lat) for lon, lat in b['outline']]
        if len(pts) >= 3:
            ds.polygon(pts, fill=(120, 118, 112, 26))
    sh = sh.filter(ImageFilter.GaussianBlur(2))

    img = Image.alpha_composite(img.convert('RGBA'), layer)
    img = Image.alpha_composite(img, sh)

img = img.convert('RGB')
img.save(os.path.join(DATA, 'basemap.jpg'), quality=88, optimize=True)
print('basemap', img.size, 'written')


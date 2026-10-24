# -*- coding: utf-8 -*-
"""抓取 Esri World Imagery 卫星影像，并按当前地形范围重采样为等经纬度网格。

背景：data/esri.jpg 必须与 data/terrain.json 的 west/south/east/north 严格一致，
否则叠加到三维场景上会与建筑/道路整体错位。

用法：
  python tools/fetch-esri.py [--z 17] [--size 4096]
"""
import argparse
import json
import math
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, '..'))
DATA = os.path.join(ROOT, 'data')
CACHE = os.path.join(ROOT, 'tmp', 'esri-tiles')

URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'


def lon2x(lon, z):
    return (lon + 180.0) / 360.0 * (1 << z)


def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)


def fetch(tile, z):
    x, y = tile
    path = os.path.join(CACHE, f'{z}_{x}_{y}.jpg')
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return tile, path
    url = URL.format(z=z, y=y, x=x)
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 cqu3d'})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            with open(path, 'wb') as f:
                f.write(data)
            return tile, path
        except Exception:
            pass
    return tile, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--z', type=int, default=17)
    ap.add_argument('--size', type=int, default=4096)
    ap.add_argument('--margin', type=float, default=0.002, help='范围外扩（度），保证边缘不露底')
    # 与 OSM/模型对齐用的平移（输出像素）：把影像内容整体移动 dx/dy 像素
    ap.add_argument('--shift-x', type=float, default=0.0)
    ap.add_argument('--out', default=os.path.join(DATA, 'esri.jpg'))
    ap.add_argument('--meta', default=os.path.join(DATA, 'terrain.json'), help='地形 meta（决定影像范围）')
    ap.add_argument('--quality', type=int, default=84)
    ap.add_argument('--shift-y', type=float, default=0.0)
    args = ap.parse_args()
    z = args.z

    meta = json.load(open(args.meta, encoding='utf-8'))
    west, south, east, north = meta['west'], meta['south'], meta['east'], meta['north']
    os.makedirs(CACHE, exist_ok=True)

    # 抓取略大于目标范围的一圈瓦片
    x0 = int(math.floor(lon2x(west - args.margin, z)))
    x1 = int(math.ceil(lon2x(east + args.margin, z)))
    y0 = int(math.floor(lat2y(north + args.margin, z)))
    y1 = int(math.ceil(lat2y(south - args.margin, z)))
    cols, rows = x1 - x0, y1 - y0
    print(f'tiles {cols}x{rows} = {cols * rows}', flush=True)

    tiles = [(x, y) for y in range(y0, y1) for x in range(x0, x1)]
    with ThreadPoolExecutor(max_workers=12) as ex:
        res = list(ex.map(lambda t: fetch(t, z), tiles))
    ok = [r for r in res if r[1]]
    print('fetched', len(ok), '/', len(tiles), flush=True)
    if len(ok) < len(tiles) * 0.98:
        missing = [t for t, p in res if not p]
        print('WARN missing tiles', len(missing), missing[:6], flush=True)

    mosaic = Image.new('RGB', (cols * 256, rows * 256), (236, 232, 224))
    for (x, y), p in ok:
        try:
            mosaic.paste(Image.open(p).convert('RGB'), ((x - x0) * 256, (y - y0) * 256))
        except Exception:
            pass
    a = np.asarray(mosaic)
    h, w, _ = a.shape

    # 每列 / 每行对应的经纬度（等经纬度输出网格，取像元中心）
    W = H = args.size
    jj, ii = np.meshgrid(np.arange(W), np.arange(H))
    lon = west + (jj + 0.5) / W * (east - west)
    lat = north - (ii + 0.5) / H * (north - south)

    # Web Mercator 像素坐标（浮点，双线性更稳）
    X = (lon2x(0, 0) * 0) + (lon + 180.0) / 360.0 * (1 << z)
    Y = (1.0 - np.log(np.tan(np.radians(lat)) + 1.0 / np.cos(np.radians(lat))) / np.pi) / 2.0 * (1 << z)
    X = (X - x0) * 256 - 0.5
    Y = (Y - y0) * 256 - 0.5
    # 对齐平移：out[y,x] = src[y - dy, x - dx]
    X = X - args.shift_x
    Y = Y - args.shift_y
    X = np.clip(X, 0, w - 1)
    Y = np.clip(Y, 0, h - 1)
    xi = np.clip(np.round(X).astype(np.int32), 0, w - 1)
    yi = np.clip(np.round(Y).astype(np.int32), 0, h - 1)
    out = a[yi, xi]
    Image.fromarray(out).save(args.out, quality=args.quality, subsampling=1)
    print('data/esri.jpg', (W, H), 'extent', (west, south, east, north), flush=True)


if __name__ == '__main__':
    main()

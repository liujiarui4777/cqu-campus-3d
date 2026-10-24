# -*- coding: utf-8 -*-
"""生成风格化底图：DEM 晕渲 + OSM 水域/绿地/道路/建筑阴影烘焙。

2026-10 升级：
  * 10 km 地图：--vectors data/basemap-vectors.json 把周边城市道路/水系/建设用地烘焙进去；
  * A/B 区细节仍由 scene.json 提供（道路、球场、建筑阴影、校区边界）；
  * 矢量图层按输出像素绘制并做 0.9px 高斯模糊，等效 2px 抗锯齿。
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
DATA = os.path.join(ROOT, 'data')

AREA_COLORS = {
    'water': (146, 186, 201, 235),
    'river': (146, 186, 201, 235),
    'green': (191, 212, 172, 210),
    'pitch': (168, 196, 150, 225),
    'urban': (223, 219, 211, 120),
    'campus': (226, 220, 205, 105),
}

ROAD_COLORS = {
    'motorway': (92, 97, 104, 235),
    'trunk': (92, 97, 104, 235),
    'primary': (96, 101, 108, 235),
    'secondary': (106, 111, 118, 230),
    'tertiary': (112, 117, 123, 225),
    'residential': (124, 128, 133, 218),
    'unclassified': (126, 130, 135, 215),
    'service': (134, 138, 142, 205),
}
for _k in ('motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'):
    ROAD_COLORS[_k] = ROAD_COLORS['secondary']


def draw_areas(layer, areas, to_px):
    d = ImageDraw.Draw(layer)
    for a in areas:
        col = AREA_COLORS.get(a.get('kind'))
        if not col:
            continue
        pts = [to_px(lon, lat) for lon, lat in a.get('outline', [])]
        if len(pts) >= 3:
            d.polygon(pts, fill=col)
            if a.get('kind') in ('water', 'river'):
                d.line(pts + [pts[0]], fill=(112, 152, 170, 235), width=1)
    return layer


def draw_roads(layer, roads, to_px, px_per_meter, aa_width=1.6):
    d = ImageDraw.Draw(layer)
    for rd in roads:
        pts = [to_px(lon, lat) for lon, lat in rd.get('path', [])]
        if len(pts) < 2:
            continue
        col = ROAD_COLORS.get(rd.get('cls', ''), (128, 132, 136, 200))
        wpx = max(1.0, float(rd.get('width', 6)) * px_per_meter)
        edge = (max(0, col[0] + 24), max(0, col[1] + 24), max(0, col[2] + 24), 150)
        d.line(pts, fill=edge, width=int(round(wpx + aa_width * 2)), joint='curve')
        d.line(pts, fill=col, width=int(round(wpx)), joint='curve')
    return layer


def draw_white_models(layer, models, to_px, px_per_meter, size):
    """非重庆大学建筑：底图上的白模屋面（浅灰白块，真实轮廓）"""
    d = ImageDraw.Draw(layer)
    for b in models:
        if b.get('outline'):
            pts = [to_px(lon, lat) for lon, lat in b['outline']]
            if len(pts) < 3:
                continue
        else:
            # 兼容旧的 bbox 数据
            lon, lat = b['lon'], b['lat']
            w = b['w'] / (111320.0 * math.cos(math.radians(lat)))
            h = b['d'] / 110540.0
            pts = [
                to_px(lon - w / 2, lat + h / 2),
                to_px(lon + w / 2, lat + h / 2),
                to_px(lon + w / 2, lat - h / 2),
                to_px(lon - w / 2, lat - h / 2),
            ]
        d.polygon(pts, fill=(247, 246, 242, 232))
        d.line(pts + [pts[0]], fill=(214, 211, 204, 200), width=max(1, int(size / 4096)))
    return layer


def draw_scene(layer, scene, to_px, px_per_meter, size):
    d = ImageDraw.Draw(layer)

    # ---- 1. 水域 / 绿地 / 球场 ----
    colors = {
        'water': (146, 186, 201, 240),
        'river': (146, 186, 201, 240),
        'green': (191, 212, 172, 225),
        'pitch': (168, 196, 150, 235),
    }
    for a in scene.get('areas', []):
        col = colors.get(a.get('kind'))
        if not col:
            continue
        pts = [to_px(lon, lat) for lon, lat in a.get('outline', [])]
        if len(pts) >= 3:
            d.polygon(pts, fill=col)
            if a.get('kind') in ('water', 'river'):
                d.line(pts + [pts[0]], fill=(112, 152, 170, 245), width=max(1, int(size / 1400)))

    # ---- 2. 道路 ----
    for rd in scene.get('roads', []):
        pts = [to_px(lon, lat) for lon, lat in rd.get('path', [])]
        if len(pts) < 2:
            continue
        wpx = max(1.2, float(rd.get('width', 6)) * px_per_meter)
        cls = rd.get('cls', '')
        if cls in ('footway', 'steps', 'cycleway', 'pedestrian', 'path'):
            col = (214, 208, 196, 235)
            wpx = max(1.0, wpx)
        elif cls in ('primary', 'secondary', 'tertiary'):
            col = (96, 101, 108, 255)
            wpx = max(2.0, wpx)
        else:
            col = (118, 123, 129, 240)
        if cls not in ('footway', 'steps', 'cycleway', 'pedestrian', 'path'):
            edge = (max(0, col[0] + 26), max(0, col[1] + 26), max(0, col[2] + 26), 190)
            d.line(pts, fill=edge, width=int(round(wpx + 2.4)), joint='curve')
        d.line(pts, fill=col, width=int(round(wpx)), joint='curve')
        if cls in ('primary', 'secondary', 'tertiary') and int(rd.get('lanes', 0)) >= 2:
            d.line(pts, fill=(236, 228, 202, 210), width=max(1, int(round(wpx * 0.08))), joint='curve')

    # ---- 3. 校区边界 ----
    for b in scene.get('boundaries', []):
        coords = b.get('coords', [])
        if len(coords) < 3:
            continue
        pts = [to_px(lon, lat) for lon, lat in coords]
        col = (138, 106, 63, 220) if b.get('campus') == 'B' else (47, 111, 106, 220)
        d.line(pts + [pts[0]], fill=col, width=max(2, int(size / 1500)), joint='curve')

    # ---- 4. 建筑投影（轻微） ----
    off = max(1, int(size / 2048))
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    for b in scene.get('buildings', []):
        pts = [to_px(lon, lat) for lon, lat in b.get('outline', [])]
        if len(pts) >= 3:
            ds.polygon([(x + off * 2, y + off * 2) for x, y in pts], fill=(116, 114, 108, 34))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1.0, size / 1600)))
    layer = Image.alpha_composite(layer, shadow)
    del shadow
    return layer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bin', default='terrain')
    ap.add_argument('--out', default='basemap')
    ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--quality', type=int, default=86)
    ap.add_argument('--aa', type=float, default=0.9, help='矢量图层高斯模糊半径（像素）')
    ap.add_argument('--vectors', default='', help='10 km 周边矢量 JSON（basemap-vectors.json）')
    ap.add_argument('--no-scene', action='store_true', help='不叠加 scene.json 细节')
    # 数据子目录：虎溪用 --dir hx（data/hx/），A/B/C 留空
    ap.add_argument('--dir', default='', help='数据子目录，例如 hx')
    args = ap.parse_args()

    global DATA
    if args.dir:
        DATA = os.path.join(ROOT, 'data', args.dir)

    with open(os.path.join(DATA, args.bin + '.json'), encoding='utf-8') as f:
        meta = json.load(f)
    with open(os.path.join(DATA, args.bin + '.bin'), 'rb') as f:
        grid = np.frombuffer(f.read(), dtype=np.int16).astype(np.float32).reshape(
            meta['height'], meta['width']) * meta['scale']

    west, south, east, north = meta['west'], meta['south'], meta['east'], meta['north']
    H, W = grid.shape
    size = args.size

    # ---- 1. 地形晕渲（在原始格网上算，再重采样到输出尺寸） ----
    dy, dx = np.gradient(grid, 1.0, 1.0)
    mx = (east - west) * 111320 * math.cos(math.radians((north + south) / 2)) / W
    my = (north - south) * 110540 / H
    nx = -dx / mx
    ny = -dy / my
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / norm, ny / norm, nz / norm
    az = math.radians(315.0)
    alt = math.radians(42.0)
    lx, ly, lz = math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)
    shade = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
    shade = 0.80 + 0.20 * shade
    slope = np.clip(1.0 - nz, 0, 1)  # 0=平地 1=陡坡

    base = np.zeros((H, W, 3), dtype=np.float32)
    base[..., 0] = 0xF3
    base[..., 1] = 0xEF
    base[..., 2] = 0xE6
    # 陡坡略偏冷灰，平地保持暖白，增加体积感
    base[..., 0] *= 1.0 - 0.16 * slope
    base[..., 1] *= 1.0 - 0.10 * slope
    base[..., 2] *= 1.0 - 0.02 * slope
    rgb = np.clip(base * shade[..., None], 0, 255).astype(np.uint8)
    del base
    img = Image.fromarray(rgb, 'RGB').filter(ImageFilter.GaussianBlur(1.0))
    del rgb
    if size != W:
        img = img.resize((size, size), Image.LANCZOS)

    def to_px(lon, lat):
        return ((lon - west) / (east - west) * (size - 1), (north - lat) / (north - south) * (size - 1))

    px_per_meter = size / ((east - west) * 111320 * math.cos(math.radians((north + south) / 2)))

    # ---- 2. 10 km 周边矢量（可选） ----
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if args.vectors:
        vpath = args.vectors if os.path.isabs(args.vectors) else os.path.join(DATA, args.vectors)
        if os.path.exists(vpath):
            with open(vpath, encoding='utf-8') as f:
                vectors = json.load(f)
            layer = draw_areas(layer, vectors.get('areas', []), to_px)
            layer = draw_roads(layer, vectors.get('roads', []), to_px, px_per_meter, aa_width=1.2)
            print('vectors: areas', len(vectors.get('areas', [])), 'roads', len(vectors.get('roads', [])))

    # ---- 2b. 非重大建筑白模屋面（10 km 底图） ----
    sur_path = os.path.join(DATA, 'surroundings.json')
    if os.path.exists(sur_path):
        try:
            with open(sur_path, encoding='utf-8') as f:
                sur = json.load(f)
            if sur.get('items'):
                layer = draw_white_models(layer, sur['items'], to_px, px_per_meter, size)
                print('white models:', len(sur['items']))
        except Exception as e:  # noqa: BLE001
            print('surroundings 跳过:', e)

    # ---- 3. A/B 区细节 ----
    scene_path = os.path.join(DATA, 'scene.json')
    if not args.no_scene and os.path.exists(scene_path):
        with open(scene_path, encoding='utf-8') as f:
            scene = json.load(f)
        layer = draw_scene(layer, scene, to_px, px_per_meter, size)

    # ---- 4. 抗锯齿：矢量层轻微模糊后再合成 ----
    if args.aa > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(args.aa))
    img = Image.alpha_composite(img.convert('RGBA'), layer)
    del layer

    img = img.convert('RGB')
    out = os.path.join(DATA, args.out + '.jpg')
    img.save(out, quality=args.quality, optimize=True, subsampling=1)
    print(args.out, img.size, os.path.getsize(out) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    main()

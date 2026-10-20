# -*- coding: utf-8 -*-
import argparse, json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, '..'))
DATA = os.path.join(ROOT, 'data')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bin', default='terrain')
    ap.add_argument('--out', default='basemap')
    ap.add_argument('--size', type=int, default=1024)
    args = ap.parse_args()

    with open(os.path.join(DATA, args.bin + '.json'), encoding='utf-8') as f:
        meta = json.load(f)
    with open(os.path.join(DATA, args.bin + '.bin'), 'rb') as f:
        grid = np.frombuffer(f.read(), dtype=np.int16).astype(np.float32).reshape(meta['height'], meta['width']) * meta['scale']

    west, south, east, north = meta['west'], meta['south'], meta['east'], meta['north']
    H, W = grid.shape

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

    base = np.zeros((H, W, 3), dtype=np.float32)
    base[..., 0] = 0xF3
    base[..., 1] = 0xEF
    base[..., 2] = 0xE6
    rgb = base * shade[..., None]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(1.0))

    scene_path = os.path.join(DATA, 'scene.json')
    if os.path.exists(scene_path):
        with open(scene_path, encoding='utf-8') as f:
            scene = json.load(f)

        def to_px(lon, lat):
            return ((lon - west) / (east - west) * (W - 1), (north - lat) / (north - south) * (H - 1))

        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        colors = {'water': (150, 190, 205, 255), 'river': (150, 190, 205, 255), 'green': (196, 216, 176, 255), 'pitch': (168, 196, 150, 255)}
        for a in scene.get('areas', []):
            col = colors.get(a['kind'])
            if not col:
                continue
            pts = [to_px(lon, lat) for lon, lat in a['outline']]
            if len(pts) >= 3:
                d.polygon(pts, fill=col)

        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ds = ImageDraw.Draw(sh)
        for b in scene.get('buildings', []):
            pts = [to_px(lon, lat) for lon, lat in b['outline']]
            if len(pts) >= 3:
                ds.polygon(pts, fill=(120, 118, 112, 26))
        sh = sh.filter(ImageFilter.GaussianBlur(1.5))
        img = Image.alpha_composite(img.convert('RGBA'), layer)
        img = Image.alpha_composite(img, sh)

    img = img.convert('RGB')
    if args.size != W:
        img = img.resize((args.size, args.size), Image.LANCZOS)
    img.save(os.path.join(DATA, args.out + '.jpg'), quality=88, optimize=True)
    print(args.out, img.size, 'written', flush=True)


if __name__ == '__main__':
    main()

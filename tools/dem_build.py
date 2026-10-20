# -*- coding: utf-8 -*-
"""下载重庆大学 A 区及周边高程瓦片（AWS terrarium, 公开免鉴权），
重采样为等经纬度网格，输出 public/data/terrain.json + terrain.bin。

terrarium 编码：height = (R*256 + G + B/256) - 32768  (米)
"""
import io
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageFilter

Z = 15
# 覆盖范围：A 区 bbox（29.5618~29.5732N, 106.4585~106.4690E）外扩到约 3km × 3km
WEST, SOUTH, EAST, NORTH = 106.4510, 29.5545, 106.4790, 29.5805
OUT_W = OUT_H = 1024
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CACHE = os.path.join(os.path.dirname(__file__), "..", "tmp", "dem-tiles")


def lon2x(lon, z):
    return (lon + 180.0) / 360.0 * (1 << z)


def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)


def fetch(tile):
    x, y = tile
    path = os.path.join(CACHE, f"{Z}_{x}_{y}.png")
    if os.path.exists(path) and os.path.getsize(path) > 100:
        return tile, Image.open(path).convert("RGB")
    url = URL.format(z=Z, x=x, y=y)
    last = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cqu-3d/0.1"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            os.makedirs(CACHE, exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)
            return tile, Image.open(io.BytesIO(data)).convert("RGB")
        except Exception as e:  # noqa: BLE001
            last = e
    print("FAIL", url, last)
    return tile, None


def main():
    x0, x1 = int(math.floor(lon2x(WEST, Z))), int(math.ceil(lon2x(EAST, Z)))
    y0, y1 = int(math.floor(lat2y(NORTH, Z))), int(math.ceil(lat2y(SOUTH, Z)))
    cols, rows = x1 - x0, y1 - y0
    tiles = [(x, y) for y in range(y0, y1) for x in range(x0, x1)]
    print(f"tiles {cols}x{rows} = {len(tiles)}")

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(fetch, tiles))

    mosaic = np.zeros((rows * 256, cols * 256), dtype=np.float32)
    for (x, y), img in results:
        if img is None:
            continue
        a = np.asarray(img, dtype=np.float32)
        h = a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0
        mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = h

    # 水面/无数据瓦片解码后会变成极大负值（terrarium 的 (0,0,0) = -32768），
    # 先用局部中值补洞，避免整片地形出现深坑。
    valid = (mosaic > -100.0) & (mosaic < 5000.0)
    if not valid.all():
        med = float(np.median(mosaic[valid]))
        filled = np.where(valid, mosaic, med)
        blur = np.array(Image.fromarray(filled.astype(np.float32), mode="F").filter(ImageFilter.MedianFilter(size=15)))
        mosaic = np.where(valid, mosaic, blur)
        print("filled invalid px:", int((~valid).sum()))

    # 重采样到等经纬度网格（行列线性对应经纬度）
    jj, ii = np.meshgrid(np.arange(OUT_W), np.arange(OUT_H))
    lon = WEST + (jj + 0.5) / OUT_W * (EAST - WEST)
    lat = NORTH - (ii + 0.5) / OUT_H * (NORTH - SOUTH)
    px = np.array([lon2x(v, Z) for v in lon[0]]) * 256.0 - x0 * 256.0
    py = np.array([lat2y(v, Z) for v in lat[:, 0]]) * 256.0 - y0 * 256.0

    x_floor = np.floor(px).astype(np.int32)
    y_floor = np.floor(py).astype(np.int32)
    fx = (px - x_floor).astype(np.float32)
    fy = (py - y_floor).astype(np.float32)
    x_floor = np.clip(x_floor, 0, mosaic.shape[1] - 2)
    y_floor = np.clip(y_floor, 0, mosaic.shape[0] - 2)

    # 用 meshgrid 组合行列
    XF = np.tile(x_floor, (OUT_H, 1))
    FX = np.tile(fx, (OUT_H, 1))
    YF = np.tile(y_floor.reshape(-1, 1), (1, OUT_W))
    FY = np.tile(fy.reshape(-1, 1), (1, OUT_W))
    h00 = mosaic[YF, XF]
    h10 = mosaic[YF, XF + 1]
    h01 = mosaic[YF + 1, XF]
    h11 = mosaic[YF + 1, XF + 1]
    grid = (h00 * (1 - FX) * (1 - FY) + h10 * FX * (1 - FY)
            + h01 * (1 - FX) * FY + h11 * FX * FY)

    # 轻微平滑，去掉瓦片接缝噪声
    k = np.array([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=np.float32) / 16.0
    pad = np.pad(grid, 1, mode="edge")
    smooth = np.zeros_like(grid)
    for dy in range(3):
        for dx in range(3):
            smooth += pad[dy:dy + OUT_H, dx:dx + OUT_W] * k[dy, dx]
    grid = smooth

    print("elev min/max/mean", float(grid.min()), float(grid.max()), float(grid.mean()))
    print("corners", float(grid[0, 0]), float(grid[0, -1]), float(grid[-1, 0]), float(grid[-1, -1]))

    q = np.round(grid * 10.0).astype(np.int16)
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "terrain.bin"), "wb") as f:
        f.write(q.tobytes())

    meta = {
        "width": OUT_W,
        "height": OUT_H,
        "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        "scale": 0.1,
        "unit": "m",
        "rows": "north-to-south",
        "source": "AWS Terrain Tiles (terrarium), zoom " + str(Z),
        "sourceUrl": "https://registry.opendata.aws/terrain-tiles/",
        "min": float(grid.min()), "max": float(grid.max()),
    }
    with open(os.path.join(out_dir, "terrain.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("written", out_dir)


if __name__ == "__main__":
    sys.exit(main())


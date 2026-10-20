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
def to_lonlat(x, y):
    lon = (x / 256 + x0t) / (1 << Z) * 360 - 180
    n = math.pi - 2 * math.pi * (y / 256 + y0t) / (1 << Z)
    lat = math.degrees(math.atan(math.sinh(n)))
    return lon, lat

# 操场区域（当前 track.center 附近）
cx, cy = px(106.46433, 29.56698)
R = 140
sub = a[cy-R:cy+R, cx-R:cx+R]
r, g, b = sub[:,:,0], sub[:,:,1], sub[:,:,2]
# 红色跑道
run = (r > 110) & (r - g > 25) & (r - b > 25)
ys, xs = np.nonzero(run)
print('runway px', len(xs))
if len(xs) > 500:
    xs = xs + (cx - R); ys = ys + (cy - R)
    X0, X1, Y0, Y1 = xs.min(), xs.max(), ys.min(), ys.max()
    lon0, lat0 = to_lonlat(X0, Y1); lon1, lat1 = to_lonlat(X1, Y0)
    print('bbpx', X0, X1, Y0, Y1)
    print('bbox lonlat', round(lon0,5), round(lat0,5), '->', round(lon1,5), round(lat1,5))
    # 主成分方向
    pts = np.stack([xs - xs.mean(), ys - ys.mean()], 1).astype(np.float32)
    cov = np.cov(pts.T)
    evals, evecs = np.linalg.eigh(cov)
    major = evecs[:, np.argmax(evals)]
    ang = math.degrees(math.atan2(major[1], major[0]))  # 图像坐标 y 向下
    print('major axis angle (image deg)', round(ang, 1), '| 地理方位角约', round((ang + 90) % 180, 1))
    print('centroid lonlat', [round(v,5) for v in to_lonlat(xs.mean(), ys.mean())])
    # 长度（米）
    mlon = 111320*math.cos(math.radians(29.567)); mlat = 110540
    print('bbox m', round((X1-X0)*0.75,1), 'x', round((Y1-Y0)*0.75,1))

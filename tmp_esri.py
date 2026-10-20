# -*- coding: utf-8 -*-
import io, json, math, os, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

Z = 17
WEST, SOUTH, EAST, NORTH = 106.4500, 29.5530, 106.4800, 29.5820
CACHE = os.path.join('tmp', 'esri-tiles')
os.makedirs(CACHE, exist_ok=True)

def lon2x(lon, z): return (lon + 180.0) / 360.0 * (1 << z)
def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)

x0, x1 = int(math.floor(lon2x(WEST, Z))), int(math.ceil(lon2x(EAST, Z)))
y0, y1 = int(math.floor(lat2y(NORTH, Z))), int(math.ceil(lat2y(SOUTH, Z)))
cols, rows = x1 - x0, y1 - y0
print('tiles', cols, 'x', rows, '=', cols*rows)

URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
def fetch(t):
    x, y = t
    p = os.path.join(CACHE, f'{Z}_{x}_{y}.jpg')
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return t, p
    url = URL.format(z=Z, y=y, x=x)
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 cqu3d'})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            with open(p, 'wb') as f: f.write(data)
            return t, p
        except Exception as e:
            pass
    print('FAIL', x, y)
    return t, None

tiles = [(x, y) for y in range(y0, y1) for x in range(x0, x1)]
with ThreadPoolExecutor(max_workers=10) as ex:
    res = list(ex.map(fetch, tiles))
ok = [r for r in res if r[1]]
print('ok', len(ok), '/', len(tiles))

mosaic = Image.new('RGB', (cols*256, rows*256), (240, 240, 240))
for (x, y), p in ok:
    try:
        im = Image.open(p).convert('RGB')
        mosaic.paste(im, ((x-x0)*256, (y-y0)*256))
    except Exception:
        pass

out = os.path.join('tmp', 'esri_mosaic.jpg')
mosaic.save(out, quality=90)
print('mosaic', mosaic.size, '->', out)

meta = {
  'z': Z, 'x0': x0, 'y0': y0, 'cols': cols, 'rows': rows,
  'west': WEST, 'south': SOUTH, 'east': EAST, 'north': NORTH,
  'width': mosaic.size[0], 'height': mosaic.size[1],
}
json.dump(meta, open(os.path.join('tmp', 'esri_meta.json'), 'w'))
print('meta saved')

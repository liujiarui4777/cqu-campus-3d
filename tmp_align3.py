from PIL import Image
import numpy as np, json, math
from collections import deque

plan = Image.open(r'D:\User_Data\Desktop\重庆大学3D项目\docs\reference\A区总平面图.jpg').convert('RGB')
a = np.asarray(plan).astype(np.int16); h, w, _ = a.shape
R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]
red = (R > 150) & (G < 85) & (B < 85)
mask = np.zeros((h,w), bool); mask[100:1660, 60:2100] = True
red &= mask

# 连通域：取最大的一块（校园边界红线）
seen = np.zeros_like(red, dtype=bool)
best = None; best_n = 0
ys_all, xs_all = np.nonzero(red)
for y0, x0 in zip(ys_all[::7], xs_all[::7]):
    if seen[y0, x0]: continue
    q = deque([(y0, x0)]); seen[y0, x0] = True
    pts = []
    while q:
        y, x = q.popleft(); pts.append((x, y))
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                ny, nx = y+dy, x+dx
                if 0 <= ny < h and 0 <= nx < w and red[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx] = True; q.append((ny,nx))
    if len(pts) > best_n:
        best_n = len(pts); best = pts
print('largest red component n', best_n)
arr = np.array(best)
xs, ys = arr[:,0], arr[:,1]
print('bbox', xs.min(), xs.max(), ys.min(), ys.max())

pix_pts = {
  'west':  (int(xs[np.argmin(xs)]), int(ys[np.argmin(xs)])),
  'east':  (int(xs[np.argmax(xs)]), int(ys[np.argmax(xs)])),
  'north': (int(xs[np.argmin(ys)]), int(ys[np.argmin(ys)])),
  'south': (int(xs[np.argmax(ys)]), int(ys[np.argmax(ys)])),
}
print('pix extremes', pix_pts)

scene = json.load(open(r'D:\User_Data\Desktop\重庆大学3D项目\cqu-3d\data\scene.json', encoding='utf-8'))
bd = scene['boundary']
lons = [p[0] for p in bd]; lats = [p[1] for p in bd]
geo_pts = {
  'west':  (lons[int(np.argmin(lons))], lats[int(np.argmin(lons))]),
  'east':  (lons[int(np.argmax(lons))], lats[int(np.argmax(lons))]),
  'north': (lons[int(np.argmin(lats))], lats[int(np.argmin(lats))]),
  'south': (lons[int(np.argmax(lats))], lats[int(np.argmax(lats))]),
}
print('geo extremes', {k:(round(v[0],5), round(v[1],5)) for k,v in geo_pts.items()})

lat0, lon0 = 29.56793, 106.46549
mlat = 110540.0; mlon = 111320.0*math.cos(math.radians(lat0))
rows = []; rhs = []
for k in pix_pts:
    lon, lat = geo_pts[k]
    X = (lon-lon0)*mlon; Y = (lat-lat0)*mlat
    rows.append([X, -Y, 1, 0]); rhs.append(pix_pts[k][0])
    rows.append([Y,  X, 0, 1]); rhs.append(pix_pts[k][1])
A = np.array(rows, float); b = np.array(rhs, float)
sol, *_ = np.linalg.lstsq(A, b, rcond=None)
aa, bb, tx, ty = sol
s = math.hypot(aa, bb); theta = math.degrees(math.atan2(bb, aa))
rms = float(np.sqrt(((A@sol - b)**2).mean()))
print('scale', round(s,3), 'theta', round(theta,2), 't', round(tx), round(ty), 'rms(px)', round(rms,1))
json.dump({'aa':aa,'bb':bb,'tx':tx,'ty':ty,'lon0':lon0,'lat0':lat0,'rms':rms,'scale':s,'theta':theta},
          open(r'D:\User_Data\Desktop\重庆大学3D项目\cqu-3d\tmp\align.json','w'))

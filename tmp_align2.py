from PIL import Image
import numpy as np, json, math

plan = Image.open(r'D:\User_Data\Desktop\重庆大学3D项目\docs\reference\A区总平面图.jpg').convert('RGB')
a = np.asarray(plan).astype(np.int16); h, w, _ = a.shape
R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]

red = (R > 150) & (G < 85) & (B < 85)
# 只保留校园范围（去掉图框附近可能存在的红色）
mask = np.zeros((h,w), bool); mask[150:1660, 60:2060] = True
red &= mask
ys, xs = np.nonzero(red)
print('red n', len(xs), 'bbox', xs.min(), xs.max(), ys.min(), ys.max())

# 红线的四个极值点
i_minx = np.argmin(xs); i_maxx = np.argmax(xs)
i_miny = np.argmin(ys); i_maxy = np.argmax(ys)
pix_pts = {
  'west':  (xs[i_minx], ys[i_minx]),
  'east':  (xs[i_maxx], ys[i_maxx]),
  'north': (xs[i_miny], ys[i_miny]),
  'south': (xs[i_maxy], ys[i_maxy]),
}
print('pix extremes', pix_pts)

scene = json.load(open(r'D:\User_Data\Desktop\重庆大学3D项目\cqu-3d\data\scene.json', encoding='utf-8'))
bd = scene['boundary']
lons = [p[0] for p in bd]; lats = [p[1] for p in bd]
i_w = int(np.argmin(lons)); i_e = int(np.argmax(lons))
i_s = int(np.argmin(lats)); i_n = int(np.argmax(lats))
geo_pts = {
  'west':  (lons[i_w], lats[i_w]),
  'east':  (lons[i_e], lats[i_e]),
  'north': (lons[i_n], lats[i_n]),
  'south': (lons[i_s], lats[i_s]),
}
print('geo extremes', {k:(round(v[0],5), round(v[1],5)) for k,v in geo_pts.items()})

lat0, lon0 = 29.56793, 106.46549
mlat = 110540.0; mlon = 111320.0*math.cos(math.radians(lat0))
rows = []; rhs = []; keys = []
for k in pix_pts:
    lon, lat = geo_pts[k]
    X = (lon-lon0)*mlon; Y = (lat-lat0)*mlat
    rows.append([X, -Y, 1, 0]); rhs.append(pix_pts[k][0]); keys.append(k)
    rows.append([Y,  X, 0, 1]); rhs.append(pix_pts[k][1]); keys.append(k)
A = np.array(rows, float); b = np.array(rhs, float)
sol, *_ = np.linalg.lstsq(A, b, rcond=None)
aa, bb, tx, ty = sol
s = math.hypot(aa, bb); theta = math.degrees(math.atan2(bb, aa))
res = A@sol - b
rms = float(np.sqrt((res**2).mean()))
print('scale', round(s,3), 'theta', round(theta,2), 't', round(tx), round(ty), 'rms(px)', round(rms,1))

np.save(r'D:\User_Data\Desktop\重庆大学3D项目\cqu-3d\tmp\align.npy', np.array([aa,bb,tx,ty]))
json.dump({'aa':aa,'bb':bb,'tx':tx,'ty':ty,'lon0':lon0,'lat0':lat0,'rms':rms,'scale':s,'theta':theta},
          open(r'D:\User_Data\Desktop\重庆大学3D项目\cqu-3d\tmp\align.json','w'))

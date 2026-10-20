from PIL import Image, ImageDraw
import numpy as np, json, math

plan = Image.open(r'D:\User_Data\Desktop\重庆大学3D项目\docs\reference\A区总平面图.jpg').convert('RGB')
a = np.asarray(plan).astype(np.int16); h, w, _ = a.shape
R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]

# 校园红线：整张图里最长的红色连通圈，用红色像素的稳健中心
red = (R > 150) & (G < 80) & (B < 80)
mask = np.zeros((h,w), bool); mask[150:1650, 60:2050] = True
red = red & mask
ys, xs = np.nonzero(red)
red_c = (np.median(xs), np.median(ys))
print('red center', red_c, 'n', len(xs))

# 民主湖（校园内蓝色）
water = (B > 140) & (B - R > 35) & (B - G > 15) & mask
ys2, xs2 = np.nonzero(water)
# 只取民主湖所在区域（图下半部偏右）
sel = (xs2 > 1000) & (xs2 < 1700) & (ys2 > 850) & (ys2 < 1300)
wx, wy = xs2[sel].mean(), ys2[sel].mean()
print('lake px', round(wx), round(wy), 'n', int(sel.sum()))

# 主教学楼：右上角大片白（近似矩形），用白色在右上区域
white = (R > 238) & (G > 238) & (B > 238)
m2 = np.zeros((h,w), bool); m2[380:560, 1080:1320] = True
ys3, xs3 = np.nonzero(white & m2)
mx, my = xs3.mean(), ys3.mean()
print('main px', round(mx), round(my), 'n', len(xs3))

# 地理坐标
geo = {
 'lake': (106.46596, 29.56637),
 'main': (106.46655, 29.56840),
 'red':  (106.46549, 29.56793),
}
pix = {'lake': (wx, wy), 'main': (mx, my), 'red': red_c}
print('pix', {k:(round(v[0]),round(v[1])) for k,v in pix.items()})

# 相似变换：像素 = s*R(theta)*(X, Y) + t，X/Y 为米坐标
lat0, lon0 = 29.56793, 106.46549
mlat = 110540.0; mlon = 111320.0*math.cos(math.radians(lat0))
rows = []; rhs = []
for k in pix:
    lon, lat = geo[k]
    X = (lon-lon0)*mlon; Y = (lat-lat0)*mlat
    rows.append([X, -Y, 1, 0]); rhs.append(pix[k][0])
    rows.append([Y,  X, 0, 1]); rhs.append(pix[k][1])
A = np.array(rows, float); b = np.array(rhs, float)
sol, *_ = np.linalg.lstsq(A, b, rcond=None)
aa, bb, tx, ty = sol
s = math.hypot(aa, bb); theta = math.atan2(bb, aa)
print('scale(px/m)', round(s,3), 'theta(deg)', round(math.degrees(theta),2), 't', round(tx), round(ty))
res = A@sol - b
print('residual(px) rms', round(float(np.sqrt((res**2).mean())),1))

# 投影 OSM 建筑
scene = json.load(open(r'D:\User_Data\Desktop\重庆大学3D项目\cqu-3d\data\scene.json', encoding='utf-8'))
out = plan.copy(); d = ImageDraw.Draw(out)
for bd in scene['buildings']:
    pts = []
    for lon, lat in bd['outline']:
        X = (lon-lon0)*mlon; Y = (lat-lat0)*mlat
        px = aa*X - bb*Y + tx
        py = bb*X + aa*Y + ty
        pts.append((px, py))
    if len(pts) >= 3:
        d.polygon(pts, outline=(0, 120, 255))
out.save(r'D:\User_Data\Desktop\重庆大学3D项目\docs\reference\配准对比.jpg', quality=86)
print('saved 配准对比.jpg')

from PIL import Image
import numpy as np

p = r'D:\User_Data\Desktop\重庆大学3D项目\docs\reference\A区总平面图.jpg'
img = Image.open(p).convert('RGB')
a = np.asarray(img).astype(np.int16)
h, w, _ = a.shape
R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]

# 校园内部区域（排除校徽、江面、图框）
mask_area = np.zeros((h, w), bool)
mask_area[210:1520, 300:1900] = True

water = (B > 140) & (B - R > 35) & (B - G > 15) & mask_area
ys, xs = np.nonzero(water)
print('湖 px', len(xs), 'centroid', int(xs.mean()), int(ys.mean()), 'bbox', xs.min(), xs.max(), ys.min(), ys.max())

# 跑道红色（跑道圈）
run = (R > 140) & (G < 110) & (B < 110) & mask_area
ys2, xs2 = np.nonzero(run)
print('跑道红 px', len(xs2))
if len(xs2):
    # 聚类：按 y 分上下两团
    mid = int((ys2.min() + ys2.max()) / 2)
    low = ys2 > mid
    print(' 下方团 centroid', int(xs2[low].mean()), int(ys2[low].mean()), 'n', int(low.sum()))
    print(' 上方团 centroid', int(xs2[~low].mean()), int(ys2[~low].mean()), 'n', int((~low).sum()))

# 白色大块（建筑）：靠近主教学楼区域（右上）
white = (R > 235) & (G > 235) & (B > 235)
sub = white[300:520, 1150:1450]
ys3, xs3 = np.nonzero(sub)
print('右上白块 px', len(xs3), 'centroid', int(xs3.mean())+1150 if len(xs3) else None, int(ys3.mean())+300 if len(ys3) else None)

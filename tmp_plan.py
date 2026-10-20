from PIL import Image
import numpy as np

p = r'D:\User_Data\Desktop\重庆大学3D项目\docs\reference\A区总平面图.jpg'
img = Image.open(p).convert('RGB')
a = np.asarray(img).astype(np.int16)
h, w, _ = a.shape
print('size', w, h)

# 找蓝色水域（民主湖）：B 明显高于 R、G
R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]
water = (B > 150) & (B - R > 40) & (B - G > 20)
ys, xs = np.nonzero(water)
print('water px', len(xs))
if len(xs):
    print('water bbox', xs.min(), xs.max(), ys.min(), ys.max())
    print('water centroid', int(xs.mean()), int(ys.mean()))

# 找红色边界线（校园红线）
red = (R > 170) & (G < 90) & (B < 90)
ys2, xs2 = np.nonzero(red)
print('red px', len(xs2))
if len(xs2):
    print('red bbox', xs2.min(), xs2.max(), ys2.min(), ys2.max())

# 找绿色场地（草坪/运动场）
green = (G > 130) & (G - R > 25) & (G - B > 25)
ys3, xs3 = np.nonzero(green)
print('green px', len(xs3))

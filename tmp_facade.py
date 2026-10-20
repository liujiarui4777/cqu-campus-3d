from PIL import Image, ImageDraw
import os

S = 512
img = Image.new('RGB', (S, S), (255, 255, 255))
d = ImageDraw.Draw(img)

# 每个重复单元：宽 128px（约 8m）、高 64px（约 1 层 3.2m）
UW, UH = 128, 64
win_h = 26
win_top = 18

for uy in range(0, S, UH):
    # 楼层分隔（女儿墙/楼板线）
    d.rectangle([0, uy + UH - 8, S, uy + UH], fill=(150, 150, 150))
    for ux in range(0, S, UW):
        # 窗洞
        d.rectangle(
            [ux + 12, uy + win_top, ux + UW - 12, uy + win_top + win_h],
            fill=(96, 96, 96),
        )
        # 窗框高光
        d.rectangle(
            [ux + 12, uy + win_top, ux + UW - 12, uy + win_top + 2],
            fill=(210, 210, 210),
        )
        # 竖向中梃
        d.rectangle(
            [ux + UW // 2 - 1, uy + win_top, ux + UW // 2 + 1, uy + win_top + win_h],
            fill=(170, 170, 170),
        )

img.save(os.path.join('data', 'facade.png'))
print('facade.png written', img.size)

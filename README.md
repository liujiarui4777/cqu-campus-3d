# 重庆大学 · 三维校园（A 区）

用 CesiumJS 做的重庆大学 A 区（沙坪坝正街 174 号）三维校园地图：真实地形起伏、按考据还原的 108 栋建筑体块、地标导览、搜索、点击信息卡、昼夜切换。

## 运行

纯静态站点，不需要构建工具：

```bash
node tools/serve.mjs        # 打开 http://127.0.0.1:5181/
```

## 数据与脚本

| 脚本 | 作用 | 产出 |
|---|---|---|
| `tools/build-scene.mjs` | OSM 原始数据 → 场景数据（建筑高度/颜色/屋顶/地标） | `data/scene.json` |
| `tools/dem_build2.py` | 下载 AWS Terrain Tiles 高程瓦片，重采样 | `data/terrain.bin` / `terrain_coarse.bin` |
| `tools/gen_basemap2.py` | DEM 晕渲 + OSM 绿地/水域 → 风格化底图 | `data/basemap.jpg` / `basemap_coarse.jpg` |

```bash
node tools/build-scene.mjs
python tools/dem_build2.py --z 15 --west 106.451 --south 29.5545 --east 106.479 --north 29.5805 --out terrain --size 2048
python tools/dem_build2.py --z 14 --west 106.395 --south 29.4975 --east 106.5345 --north 29.6365 --out terrain_coarse --size 1024
python tools/gen_basemap2.py --bin terrain --out basemap --size 2048
python tools/gen_basemap2.py --bin terrain_coarse --out basemap_coarse --size 1024
```

## 数据来源与署名

- **建筑轮廓 / 道路 / 水域 / 道路宽度**：© OpenStreetMap 贡献者，[ODbL 1.0](https://www.openstreetmap.org/copyright)。本页面的衍生数据同样以 ODbL 提供。
- **地形高程**：AWS Terrain Tiles（Mapzen terrarium，公开数据集，基于 SRTM/ASTER/GMTED 等）。
- **建筑层数 / 高度 / 形制 / 历史**：依据重庆市文旅委文物资料、中国土木工程学会詹天佑奖工程页、重庆大学官方发布与公开报道考证整理，详见 `../docs/调研-A区建筑资料.md`。无公开数据处按层高与体量合理推测，页面已标注。

## 技术说明

- 不使用任何需要密钥的在线服务（无 Cesium ion token），地形与底图全部本地化。
- CesiumJS 以 UMD 方式引入（`cesium/`），避免在受限环境下依赖打包器。

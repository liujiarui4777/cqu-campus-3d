/* 非重庆大学建筑：10 km 范围内的白色体块（白模），作为城市背景，不参与拾取
 *
 * 参照高德地图的城市白模：统一近白色，轻微明暗差异表现体量；
 * 高度按 OSM 层数/建筑类型推断，A/B 区内的精细建筑已排除（见 tools/build-surroundings-10km.mjs）。
 */
export async function addSurroundings(viewer, base, terrain) {
  const Cesium = window.Cesium;
  const data = await fetch(`${base}data/surroundings.json`).then((r) => r.json());
  const items = data.items || [];
  if (!items.length) return 0;

  const boxGeo = new Cesium.BoxGeometry({
    minimum: new Cesium.Cartesian3(-0.5, -0.5, -0.5),
    maximum: new Cesium.Cartesian3(0.5, 0.5, 0.5),
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });

  const palette = ['#f7f6f3', '#efede8', '#f3f1ec'].map((c) => Cesium.Color.fromCssColorString(c));
  const insts = [];
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    const h = Math.max(3, b.h || 10);
    const h0 = terrain.sample(b.lon, b.lat);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(b.lon, b.lat, h0 + h / 2 - 0.6),
    );
    const scale = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(b.w, b.d, h + 1.2));
    const m = Cesium.Matrix4.multiply(enu, scale, new Cesium.Matrix4());
    insts.push(
      new Cesium.GeometryInstance({
        geometry: boxGeo,
        modelMatrix: m,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(palette[i % palette.length]),
        },
      }),
    );
  }

  viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: insts,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      asynchronous: true,
    }),
  );

  return insts.length;
}

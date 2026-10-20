/* 场景构件：区域 / 道路 / 建筑 / 边界 */

const ringPositions = (Cesium, ring, height) =>
  ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, height));

export function addBoundary(viewer, data, terrain) {
  const Cesium = window.Cesium;
  if (!data.boundary || !data.boundary.length) return;
  const coords = [];
  for (const [lon, lat] of data.boundary) coords.push(lon, lat);
  const inst = new Cesium.GeometryInstance({
    geometry: new Cesium.GroundPolylineGeometry({
      positions: Cesium.Cartesian3.fromDegreesArray(coords),
      width: 2.2,
    }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(
        Cesium.Color.fromCssColorString('#2f6f6a').withAlpha(0.9),
      ),
    },
  });
  viewer.scene.primitives.add(
    new Cesium.GroundPolylinePrimitive({
      geometryInstances: [inst],
      appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
      classificationType: Cesium.ClassificationType.TERRAIN,
      asynchronous: true,
    }),
  );
}

export function addBuildings(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const store = viewer.entities;

  for (const b of data.buildings) {
    if (!b.outline || b.outline.length < 3) continue;
    const h0 = terrain.sample(b.center[0], b.center[1]);
    const bottom = h0 - 8;
    const top = h0 + b.height;
    const flat = [];
    for (const [lon, lat] of b.outline) flat.push(lon, lat);
    const hierarchy = Cesium.Cartesian3.fromDegreesArray(flat);

    const wall = Cesium.Color.fromCssColorString(b.wall || '#e1dcd0');
    const roof = Cesium.Color.fromCssColorString(b.roofColor || '#a8a49b');

    store.add({
      id: 'b:' + b.id,
      name: b.name || '未命名建筑',
      position: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], top),
      polygon: {
        hierarchy,
        height: bottom,
        extrudedHeight: top,
        material: wall,
        outline: false,
        perPositionHeight: false,
      },
      properties: { kind: 'building', data: b },
    });

    // 屋顶面：单独一层薄面，保证屋顶色与墙面色分开
    store.add({
      id: 'r:' + b.id,
      polygon: {
        hierarchy,
        height: top + 0.06,
        material: roof,
        outline: false,
      },
      properties: { kind: 'roof', data: b },
    });
  }
}

export function addAreas(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const water = [];
  const green = [];
  const pitch = [];

  for (const a of data.areas) {
    if (!a.outline || a.outline.length < 3) continue;
    if (a.kind === 'river') continue;
    const inst = new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(ringPositions(Cesium, a.outline, 0)),
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString(a.color),
        ),
      },
      id: { kind: 'area', id: a.id },
    });
    if (a.kind === 'water') water.push(inst);
    else if (a.kind === 'green') green.push(inst);
    else if (a.kind === 'pitch') pitch.push(inst);
  }

  const add = (insts) => {
    if (!insts.length) return;
    viewer.scene.primitives.add(
      new Cesium.GroundPrimitive({
        geometryInstances: insts,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false }),
        classificationType: Cesium.ClassificationType.TERRAIN,
        asynchronous: true,
      }),
    );
  };
  add(green);
  add(pitch);
  add(water);
}

export function addRoads(viewer, data) {
  const Cesium = window.Cesium;
  const major = [];
  const minor = [];

  for (const r of data.roads) {
    if (!r.path || r.path.length < 2) continue;
    const isMajor = ['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link'].includes(
      r.cls,
    );
    const pos = [];
    for (const [lon, lat] of r.path) pos.push(lon, lat);
    const color = isMajor
      ? Cesium.Color.fromCssColorString('#c6bfb0')
      : r.cls === 'footway' || r.cls === 'steps'
        ? Cesium.Color.fromCssColorString('#d7d1c3').withAlpha(0.9)
        : Cesium.Color.fromCssColorString('#d2ccbe');

    const inst = new Cesium.GeometryInstance({
      geometry: new Cesium.GroundPolylineGeometry({
        positions: Cesium.Cartesian3.fromDegreesArray(pos),
        width: Math.max(1.6, r.width * 0.5),
      }),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
    });
    (isMajor ? major : minor).push(inst);
  }

  const add = (insts) => {
    if (!insts.length) return;
    viewer.scene.primitives.add(
      new Cesium.GroundPolylinePrimitive({
        geometryInstances: insts,
        appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
        classificationType: Cesium.ClassificationType.TERRAIN,
        asynchronous: true,
      }),
    );
  };
  add(major);
  add(minor);
}



/* 嘉陵江：用固定水面高程的多边形，避免贴地后被岸边地形切碎 */
export function addRiver(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const rivers = (data.areas || []).filter((a) => a.kind === 'river');
  if (!rivers.length) return;
  for (const r of rivers) {
    let minH = Infinity;
    for (const [lon, lat] of r.outline) minH = Math.min(minH, terrain.sample(lon, lat));
    if (!isFinite(minH)) minH = 170;
    const flat = [];
    for (const [lon, lat] of r.outline) flat.push(lon, lat);
    viewer.entities.add({
      id: 'river:' + r.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
        height: minH + 2.5,
        material: Cesium.Color.fromCssColorString('#a5c8d8').withAlpha(0.94),
      },
      properties: { kind: 'river', name: '嘉陵江' },
    });
  }
}

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyRouteType,
  pickRepresentativeShapeId,
  buildShapeCoordinates,
  buildRouteFeature,
  groupRoutesByLayer,
} = require('./gtfs');

test('classifyRouteType maps GTFS route_type codes to layer names', () => {
  assert.equal(classifyRouteType('0'), 'streetcar');
  assert.equal(classifyRouteType('1'), 'subway');
  assert.equal(classifyRouteType('3'), 'bus');
  assert.equal(classifyRouteType('2'), null); // heavy rail — TTC doesn't use this code
});

test('pickRepresentativeShapeId picks the shape with the most points', () => {
  const trips = [{ shape_id: 'A' }, { shape_id: 'B' }];
  const shapePointCounts = new Map([['A', 5], ['B', 12]]);
  assert.equal(pickRepresentativeShapeId(trips, shapePointCounts), 'B');
});

test('pickRepresentativeShapeId returns null when there are no trips', () => {
  assert.equal(pickRepresentativeShapeId([], new Map()), null);
});

test('buildShapeCoordinates sorts points by sequence and returns [lon, lat] pairs', () => {
  const rows = [
    { shape_pt_lat: '43.7', shape_pt_lon: '-79.4', shape_pt_sequence: '2' },
    { shape_pt_lat: '43.6', shape_pt_lon: '-79.3', shape_pt_sequence: '1' },
  ];
  assert.deepEqual(buildShapeCoordinates(rows), [
    [-79.3, 43.6],
    [-79.4, 43.7],
  ]);
});

test('buildRouteFeature builds a GeoJSON Feature with route properties', () => {
  const route = {
    route_id: '504',
    route_short_name: '504',
    route_long_name: 'King',
    route_color: 'B4131F',
  };
  const feature = buildRouteFeature(route, [[-79.4, 43.7], [-79.3, 43.6]]);
  assert.equal(feature.type, 'Feature');
  assert.equal(feature.geometry.type, 'LineString');
  assert.deepEqual(feature.geometry.coordinates, [[-79.4, 43.7], [-79.3, 43.6]]);
  assert.equal(feature.properties.route_id, '504');
  assert.equal(feature.properties.short_name, '504');
  assert.equal(feature.properties.long_name, 'King');
  assert.equal(feature.properties.color, '#B4131F');
});

test('buildRouteFeature yields properties.color = null when route_color is empty', () => {
  const route = { route_id: '7', route_short_name: '7', route_long_name: 'Bathurst', route_color: '' };
  const feature = buildRouteFeature(route, [[-79.4, 43.7], [-79.3, 43.6]]);
  assert.equal(feature.properties.color, null);
});

test('groupRoutesByLayer groups routes into bus/streetcar/subway with representative shapes', () => {
  const routes = [
    { route_id: '504', route_short_name: '504', route_long_name: 'King', route_type: '0', route_color: 'B4131F' },
    { route_id: '1', route_short_name: '1', route_long_name: 'Yonge-University', route_type: '1', route_color: 'F8C300' },
    { route_id: '7', route_short_name: '7', route_long_name: 'Bathurst', route_type: '3', route_color: '' },
    { route_id: '999', route_short_name: '999', route_long_name: 'GO Train (not TTC)', route_type: '2', route_color: '' },
  ];
  const trips = [
    { route_id: '504', shape_id: 'shape-504-a' },
    { route_id: '504', shape_id: 'shape-504-b' },
    { route_id: '1', shape_id: 'shape-1-a' },
    { route_id: '7', shape_id: 'shape-7-a' },
    { route_id: '999', shape_id: 'shape-999-a' },
  ];
  const shapes = [
    { shape_id: 'shape-504-a', shape_pt_lat: '43.6', shape_pt_lon: '-79.4', shape_pt_sequence: '1' },
    { shape_id: 'shape-504-a', shape_pt_lat: '43.61', shape_pt_lon: '-79.41', shape_pt_sequence: '2' },
    { shape_id: 'shape-504-b', shape_pt_lat: '43.6', shape_pt_lon: '-79.4', shape_pt_sequence: '1' },
    { shape_id: 'shape-504-b', shape_pt_lat: '43.61', shape_pt_lon: '-79.41', shape_pt_sequence: '2' },
    { shape_id: 'shape-504-b', shape_pt_lat: '43.62', shape_pt_lon: '-79.42', shape_pt_sequence: '3' },
    { shape_id: 'shape-1-a', shape_pt_lat: '43.7', shape_pt_lon: '-79.5', shape_pt_sequence: '1' },
    { shape_id: 'shape-1-a', shape_pt_lat: '43.71', shape_pt_lon: '-79.51', shape_pt_sequence: '2' },
    { shape_id: 'shape-7-a', shape_pt_lat: '43.65', shape_pt_lon: '-79.45', shape_pt_sequence: '1' },
    { shape_id: 'shape-7-a', shape_pt_lat: '43.66', shape_pt_lon: '-79.46', shape_pt_sequence: '2' },
  ];

  const layers = groupRoutesByLayer({ routes, trips, shapes });

  assert.equal(layers.streetcar.length, 1);
  assert.equal(layers.streetcar[0].properties.route_id, '504');
  // shape-504-b has 3 points vs shape-504-a's 2, so it should be picked
  assert.equal(layers.streetcar[0].geometry.coordinates.length, 3);

  assert.equal(layers.subway.length, 1);
  assert.equal(layers.subway[0].properties.route_id, '1');

  assert.equal(layers.bus.length, 1);
  assert.equal(layers.bus[0].properties.route_id, '7');

  // route_type 2 isn't one of our three layers, so route 999 is dropped entirely
  const allRouteIds = [...layers.bus, ...layers.streetcar, ...layers.subway].map((f) => f.properties.route_id);
  assert.equal(allRouteIds.includes('999'), false);
});

test('groupRoutesByLayer drops a route that has no trips at all', () => {
  const routes = [
    { route_id: '900', route_short_name: '900', route_long_name: 'Airport Express', route_type: '3', route_color: '' },
  ];
  const layers = groupRoutesByLayer({ routes, trips: [], shapes: [] });
  assert.deepEqual(layers, { bus: [], streetcar: [], subway: [] });
});

test('groupRoutesByLayer ignores trips with an empty or missing shape_id', () => {
  const routes = [
    { route_id: '7', route_short_name: '7', route_long_name: 'Bathurst', route_type: '3', route_color: '' },
  ];
  const trips = [
    { route_id: '7', shape_id: '' },
    { route_id: '7' }, // shape_id column absent entirely
  ];
  const shapes = [
    { shape_id: '', shape_pt_lat: '43.6', shape_pt_lon: '-79.4', shape_pt_sequence: '1' },
    { shape_id: '', shape_pt_lat: '43.61', shape_pt_lon: '-79.41', shape_pt_sequence: '2' },
  ];
  // Both trips are skipped, so the route has no usable shape and is dropped.
  const layers = groupRoutesByLayer({ routes, trips, shapes });
  assert.equal(layers.bus.length, 0);
});

test('groupRoutesByLayer drops a route whose best shape has only one point', () => {
  const routes = [
    { route_id: '1', route_short_name: '1', route_long_name: 'Yonge-University', route_type: '1', route_color: 'F8C300' },
  ];
  const trips = [{ route_id: '1', shape_id: 'shape-1-a' }];
  const shapes = [
    { shape_id: 'shape-1-a', shape_pt_lat: '43.7', shape_pt_lon: '-79.5', shape_pt_sequence: '1' },
  ];
  // A LineString needs at least 2 positions, so this route is excluded.
  const layers = groupRoutesByLayer({ routes, trips, shapes });
  assert.equal(layers.subway.length, 0);
});

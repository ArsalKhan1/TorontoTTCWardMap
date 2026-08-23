// GTFS -> GeoJSON conversion logic. Pure functions, no I/O — fetch-data.js
// (Task 2) handles downloading and file writing; this module only transforms
// already-parsed GTFS rows into GeoJSON features.

const ROUTE_TYPE_TO_LAYER = {
  0: 'streetcar',
  1: 'subway',
  3: 'bus',
};

function classifyRouteType(routeType) {
  return ROUTE_TYPE_TO_LAYER[String(routeType)] || null;
}

function pickRepresentativeShapeId(tripsForRoute, shapePointCounts) {
  let bestShapeId = null;
  let bestCount = -1;
  for (const trip of tripsForRoute) {
    const count = shapePointCounts.get(trip.shape_id) || 0;
    if (count > bestCount) {
      bestCount = count;
      bestShapeId = trip.shape_id;
    }
  }
  return bestShapeId;
}

function buildShapeCoordinates(shapeRows) {
  return [...shapeRows]
    .sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence))
    .map((row) => [Number(row.shape_pt_lon), Number(row.shape_pt_lat)]);
}

function buildRouteFeature(route, coordinates) {
  return {
    type: 'Feature',
    properties: {
      route_id: route.route_id,
      short_name: route.route_short_name,
      long_name: route.route_long_name,
      color: route.route_color ? `#${route.route_color}` : null,
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

function groupRoutesByLayer({ routes, trips, shapes }) {
  const shapePointsByShapeId = new Map();
  for (const point of shapes) {
    if (!shapePointsByShapeId.has(point.shape_id)) {
      shapePointsByShapeId.set(point.shape_id, []);
    }
    shapePointsByShapeId.get(point.shape_id).push(point);
  }

  const shapePointCounts = new Map();
  for (const [shapeId, points] of shapePointsByShapeId) {
    shapePointCounts.set(shapeId, points.length);
  }

  const tripsByRouteId = new Map();
  for (const trip of trips) {
    if (!trip.shape_id) continue;
    if (!tripsByRouteId.has(trip.route_id)) {
      tripsByRouteId.set(trip.route_id, []);
    }
    tripsByRouteId.get(trip.route_id).push(trip);
  }

  const layers = { bus: [], streetcar: [], subway: [] };

  for (const route of routes) {
    const layer = classifyRouteType(route.route_type);
    if (!layer) continue;

    const tripsForRoute = tripsByRouteId.get(route.route_id) || [];
    if (tripsForRoute.length === 0) continue;

    const shapeId = pickRepresentativeShapeId(tripsForRoute, shapePointCounts);
    if (!shapeId) continue;

    const shapeRows = shapePointsByShapeId.get(shapeId) || [];
    if (shapeRows.length < 2) continue;

    const coordinates = buildShapeCoordinates(shapeRows);
    layers[layer].push(buildRouteFeature(route, coordinates));
  }

  return layers;
}

module.exports = {
  classifyRouteType,
  pickRepresentativeShapeId,
  buildShapeCoordinates,
  buildRouteFeature,
  groupRoutesByLayer,
};

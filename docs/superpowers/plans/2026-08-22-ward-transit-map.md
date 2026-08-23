# Toronto TTC Ward Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static web page that overlays Toronto's ward boundaries and TTC transit routes (bus, streetcar, subway) on Google Maps, with address search and per-layer toggles.

**Architecture:** Plain static HTML/CSS/JS (no framework, no build tool) served as flat files. Ward and route geometry are pre-converted to GeoJSON once by a Node prep script (pulling from Toronto Open Data and the TTC's GTFS static feed) and committed to the repo; the page loads those static files at runtime via `google.maps.Data` layers.

**Tech Stack:** Vanilla JS/HTML/CSS, Google Maps JavaScript API (Maps + Places libraries), Node.js 18+ for the data-prep script and its tests (built-in `fetch`, built-in `node:test`), `adm-zip` + `csv-parse` as the only script dependencies.

**Spec:** [docs/superpowers/specs/2026-08-22-ward-transit-map-design.md](../specs/2026-08-22-ward-transit-map-design.md)

## Global Constraints

- No framework or build tool — plain HTML/CSS/JS only, served as static files.
- No backend/server component — the deployed site is static files only.
- No click-to-inspect interactivity for wards or routes — visual overlay only.
- Node.js 18+ required for `scripts/` (relies on built-in `fetch` and `node:test`).
- Script dependencies limited to `adm-zip` (GTFS zip extraction) and `csv-parse` (CSV parsing) — no other npm packages.
- All four map layers (wards, bus, streetcar, subway) are visible by default on page load.
- No per-ward or per-route click popups; no councillor/election data; no GTFS-realtime data (spec Non-Goals).

---

## Task 1: GTFS → GeoJSON conversion library (TDD)

**Files:**
- Create: `package.json`
- Create: `scripts/lib/gtfs.js`
- Test: `scripts/lib/gtfs.test.js`

**Interfaces:**
- Produces: `groupRoutesByLayer({ routes, trips, shapes }) -> { bus: Feature[], streetcar: Feature[], subway: Feature[] }` — consumed by Task 2's `scripts/fetch-data.js`.
- Also exports (used internally by `groupRoutesByLayer`, and tested directly): `classifyRouteType(routeType) -> 'bus'|'streetcar'|'subway'|null`, `pickRepresentativeShapeId(tripsForRoute, shapePointCounts) -> string|null`, `buildShapeCoordinates(shapeRows) -> [number, number][]`, `buildRouteFeature(route, coordinates) -> GeoJSON Feature`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "toronto-ttc-ward-map",
  "version": "1.0.0",
  "private": true,
  "description": "Toronto ward boundaries and TTC transit routes overlaid on Google Maps",
  "scripts": {
    "test": "node --test scripts/lib/*.test.js"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/lib/gtfs.test.js`:

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './gtfs'` (file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `scripts/lib/gtfs.js`:

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/lib/gtfs.js scripts/lib/gtfs.test.js
git commit -m "feat: add GTFS to GeoJSON conversion library"
```

---

## Task 2: Data-prep script — fetch and write static GeoJSON

**Files:**
- Create: `.gitignore`
- Modify: `package.json`
- Create: `scripts/fetch-data.js`
- Create: `data/wards.geojson`, `data/routes-bus.geojson`, `data/routes-streetcar.geojson`, `data/routes-subway.geojson` (generated output, committed)

**Interfaces:**
- Consumes: `groupRoutesByLayer` from `scripts/lib/gtfs.js` (Task 1).
- Produces: `data/wards.geojson`, `data/routes-bus.geojson`, `data/routes-streetcar.geojson`, `data/routes-subway.geojson` — loaded by fixed relative path in `app.js` (Task 4).

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 2: Install dependencies**

Run: `npm install --save adm-zip csv-parse`
Expected: `node_modules/` created, `package-lock.json` created, `package.json` gains a `dependencies` block for `adm-zip` and `csv-parse`.

- [ ] **Step 3: Add the `fetch-data` script to `package.json`**

Update `package.json` to:

```json
{
  "name": "toronto-ttc-ward-map",
  "version": "1.0.0",
  "private": true,
  "description": "Toronto ward boundaries and TTC transit routes overlaid on Google Maps",
  "scripts": {
    "test": "node --test scripts/lib/*.test.js",
    "fetch-data": "node scripts/fetch-data.js"
  },
  "dependencies": {
    "adm-zip": "^0.5.10",
    "csv-parse": "^5.5.6"
  }
}
```

(Keep whatever exact dependency versions `npm install` actually wrote — the version numbers above are a floor, not a pin.)

- [ ] **Step 4: Write `scripts/fetch-data.js`**

```js
#!/usr/bin/env node
// One-time/rerunnable data-prep script. Fetches ward boundaries from Toronto
// Open Data and TTC route shapes from the TTC's GTFS static feed, and writes
// static GeoJSON into data/. Rerun this only when source data changes —
// the deployed site reads the committed output, not this script.

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const { groupRoutesByLayer } = require('./lib/gtfs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WARDS_PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=city-wards';
const GTFS_PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ttc-routes-and-schedules';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseCsv(text) {
  return parse(text, { columns: true, skip_empty_lines: true });
}

async function fetchWards() {
  const pkg = await fetchJson(WARDS_PACKAGE_URL);
  const resource = pkg.result.resources.find(
    (r) => r.format.toUpperCase() === 'GEOJSON' && r.name.includes('4326')
  );
  if (!resource) {
    throw new Error('Could not find a WGS84 (4326) GeoJSON resource for city-wards');
  }
  const geojson = await fetchJson(resource.url);
  fs.writeFileSync(path.join(DATA_DIR, 'wards.geojson'), JSON.stringify(geojson, null, 2));
  console.log(`Wrote data/wards.geojson (${geojson.features.length} features)`);
}

async function fetchRoutes() {
  const pkg = await fetchJson(GTFS_PACKAGE_URL);
  const resource = pkg.result.resources.find((r) => r.format.toUpperCase() === 'ZIP');
  if (!resource) {
    throw new Error('Could not find the GTFS zip resource for ttc-routes-and-schedules');
  }

  const zipBuffer = await fetchBuffer(resource.url);
  const zip = new AdmZip(zipBuffer);

  const routes = parseCsv(zip.readAsText('routes.txt'));
  const trips = parseCsv(zip.readAsText('trips.txt'));
  const shapes = parseCsv(zip.readAsText('shapes.txt'));

  const layers = groupRoutesByLayer({ routes, trips, shapes });

  for (const [layer, features] of Object.entries(layers)) {
    const geojson = { type: 'FeatureCollection', features };
    const outPath = path.join(DATA_DIR, `routes-${layer}.geojson`);
    fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
    console.log(`Wrote data/routes-${layer}.geojson (${features.length} features)`);
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await fetchWards();
  await fetchRoutes();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Run the script**

Run: `npm run fetch-data`
Expected: Console logs five "Wrote data/..." lines (one for wards, one each for bus/streetcar/subway), no errors. This makes real network requests to Toronto Open Data and the TTC's GTFS feed.

- [ ] **Step 6: Verify the output files**

Run:
```bash
node -e "
const fs = require('fs');
for (const f of ['wards','routes-bus','routes-streetcar','routes-subway']) {
  const g = JSON.parse(fs.readFileSync('data/' + f + '.geojson'));
  console.log(f, g.type, g.features.length);
}
"
```
Expected: Each line prints `<name> FeatureCollection <count>` with `count > 0` for all four files, and the wards count at or near 25 (Toronto's current ward count).

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json scripts/fetch-data.js data/
git commit -m "feat: add data-prep script and generated ward/route GeoJSON"
```

---

## Task 3: Static page shell

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `app.js` (stub — filled in by Task 4)
- Create: `config.example.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces DOM elements consumed by later tasks: `#map` (map container, Task 4), `#legend input[data-layer="wards"|"bus"|"streetcar"|"subway"]` (checkboxes, Task 5), `#search-input` and `#search-error` (Task 6), `#layer-error-banner` (Task 4).
- Produces: `window.GOOGLE_MAPS_API_KEY` global, set by `config.js` (gitignored, copied from `config.example.js`) — consumed by Task 4.

- [ ] **Step 1: Add `config.js` to `.gitignore`**

Update `.gitignore` to:

```
node_modules/
config.js
```

- [ ] **Step 2: Create `config.example.js`**

```js
// Copy this file to config.js and fill in your own Google Maps API key.
// config.js is gitignored so your key is never committed.
window.GOOGLE_MAPS_API_KEY = 'YOUR_API_KEY_HERE';
```

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Toronto TTC Ward Map</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="map"></div>

  <div id="search-box">
    <input id="search-input" type="text" placeholder="Search an address in Toronto" />
    <div id="search-error" class="hidden">Address not found.</div>
  </div>

  <div id="legend">
    <label><input type="checkbox" data-layer="wards" checked /> Ward boundaries</label>
    <label><input type="checkbox" data-layer="bus" checked /> Bus routes</label>
    <label><input type="checkbox" data-layer="streetcar" checked /> Streetcar routes</label>
    <label><input type="checkbox" data-layer="subway" checked /> Subway lines</label>
  </div>

  <div id="layer-error-banner" class="hidden">Some map layers failed to load.</div>

  <script src="config.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `style.css`**

```css
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: system-ui, sans-serif;
}

#map {
  position: absolute;
  inset: 0;
  background: #e0e0e0;
}

#search-box {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  background: white;
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

#search-input {
  width: 280px;
  padding: 6px 8px;
  font-size: 14px;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-sizing: border-box;
}

#search-error {
  color: #b00020;
  font-size: 12px;
  margin-top: 4px;
}

#legend {
  position: absolute;
  bottom: 24px;
  left: 12px;
  z-index: 10;
  background: white;
  padding: 10px 12px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  font-size: 13px;
}

#legend label {
  display: block;
  margin: 4px 0;
}

#layer-error-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  background: #fff3cd;
  color: #664d03;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.hidden {
  display: none;
}
```

- [ ] **Step 5: Create stub `app.js`**

```js
console.log('Toronto TTC Ward Map: app.js loaded');
```

- [ ] **Step 6: Verify the shell renders**

Run: `cp config.example.js config.js` (local dev only — this file is gitignored), then serve the directory, e.g. `npx serve .` or `python3 -m http.server 8000`.

Open the served URL in a browser. Expected: a light-gray full-page map area, a search box in the top-left with placeholder text, a legend box in the bottom-left listing four checked checkboxes, and the browser console shows `Toronto TTC Ward Map: app.js loaded` with no errors.

- [ ] **Step 7: Commit**

```bash
git add .gitignore index.html style.css app.js config.example.js
git commit -m "feat: add static page shell"
```

---

## Task 4: Map initialization and GeoJSON layer rendering

**Files:**
- Modify: `app.js` (replace stub from Task 3)

**Interfaces:**
- Consumes: `window.GOOGLE_MAPS_API_KEY` (Task 3's `config.js`), `#map` and `#layer-error-banner` (Task 3), `data/wards.geojson`/`data/routes-bus.geojson`/`data/routes-streetcar.geojson`/`data/routes-subway.geojson` (Task 2).
- Produces: module-level `map` (the `google.maps.Map` instance) and `mapLayers` object (`{ wards, bus, streetcar, subway } -> google.maps.Data`), both consumed by Task 5 (legend) and Task 6 (search) since they run in the same `app.js` file scope. Global `initMap()` used as the Google Maps API's script-load callback.

- [ ] **Step 1: Replace `app.js` with map initialization and layer loading**

```js
// app.js
// Toronto TTC Ward Map — map initialization and GeoJSON layer rendering.

const DATA_FILES = {
  wards: 'data/wards.geojson',
  bus: 'data/routes-bus.geojson',
  streetcar: 'data/routes-streetcar.geojson',
  subway: 'data/routes-subway.geojson',
};

const LAYER_STYLES = {
  wards: { fillColor: '#4a90d9', fillOpacity: 0.08, strokeColor: '#4a90d9', strokeWeight: 1.5 },
  bus: { strokeColor: '#00923f', strokeWeight: 1.5 },
  streetcar: { strokeColor: '#d3242c', strokeWeight: 2 },
  subway: { strokeColor: '#f8c300', strokeWeight: 3 },
};

const TORONTO_CENTER = { lat: 43.6532, lng: -79.3832 };

let map;
const mapLayers = {};

async function loadLayer(map, key) {
  const response = await fetch(DATA_FILES[key]);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${DATA_FILES[key]}: ${response.status}`);
  }
  const geojson = await response.json();
  const dataLayer = new google.maps.Data({ map });
  dataLayer.setStyle(LAYER_STYLES[key]);
  dataLayer.addGeoJson(geojson);
  return dataLayer;
}

async function loadAllLayers(map) {
  const failedLayers = [];
  await Promise.all(
    Object.keys(DATA_FILES).map((key) =>
      loadLayer(map, key)
        .then((layer) => {
          mapLayers[key] = layer;
        })
        .catch((err) => {
          console.error(err);
          failedLayers.push(key);
        })
    )
  );
  return failedLayers;
}

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: TORONTO_CENTER,
    zoom: 11,
  });

  loadAllLayers(map).then((failedLayers) => {
    if (failedLayers.length > 0) {
      document.getElementById('layer-error-banner').classList.remove('hidden');
    }
  });
}

function loadGoogleMapsScript() {
  // libraries=places is loaded now so the search box (added in Task 6)
  // doesn't need a second script tag or a page reload.
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places`;
  script.async = true;
  document.head.appendChild(script);
}

window.initMap = initMap;
loadGoogleMapsScript();
```

- [ ] **Step 2: Verify layers render**

Ensure `config.js` (from Task 3, Step 6) has a real Google Maps API key with the Maps JavaScript API enabled and billing set up. Serve the directory and open it in a browser.

Expected: the map loads centered on Toronto at zoom 11; ward boundaries appear as translucent blue polygons; bus routes appear as thin green lines, streetcar routes as red lines, subway lines as thick yellow lines. No console errors, and `#layer-error-banner` stays hidden.

- [ ] **Step 3: Verify the error banner**

Temporarily rename `data/routes-bus.geojson` to `data/routes-bus.geojson.bak`, reload the page. Expected: the console logs a "Failed to fetch data/routes-bus.geojson" error, the other three layers still render, and the `#layer-error-banner` ("Some map layers failed to load") becomes visible. Rename the file back to `data/routes-bus.geojson` and reload to confirm the banner disappears again.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: initialize map and render ward/route GeoJSON layers"
```

---

## Task 5: Legend layer toggles

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `mapLayers` and `map` (module-level, Task 4), `#legend input[data-layer]` checkboxes (Task 3).

- [ ] **Step 1: Add `initLegend()` and call it from `initMap()`**

Add this function to `app.js` (after `loadAllLayers`, before `initMap`):

```js
function initLegend() {
  document.querySelectorAll('#legend input[data-layer]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.layer;
      const layer = mapLayers[key];
      if (!layer) return;
      layer.setMap(checkbox.checked ? map : null);
    });
  });
}
```

Then update `initMap()` to call it:

```js
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: TORONTO_CENTER,
    zoom: 11,
  });

  loadAllLayers(map).then((failedLayers) => {
    if (failedLayers.length > 0) {
      document.getElementById('layer-error-banner').classList.remove('hidden');
    }
  });

  initLegend();
}
```

- [ ] **Step 2: Verify toggles work**

Serve the directory and open it in a browser. Uncheck each of the four legend checkboxes one at a time and confirm the corresponding layer disappears from the map; re-check each and confirm it reappears.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: wire legend checkboxes to toggle map layers"
```

---

## Task 6: Address search (Places Autocomplete)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `map` (module-level, Task 4), `#search-input` and `#search-error` (Task 3).

- [ ] **Step 1: Add `initSearch(map)` and call it from `initMap()`**

Add this function to `app.js` (after `initLegend`, before `initMap`):

```js
let searchMarker = null;

function initSearch(map) {
  const input = document.getElementById('search-input');
  const errorEl = document.getElementById('search-error');

  const autocomplete = new google.maps.places.Autocomplete(input, {
    bounds: new google.maps.LatLngBounds(
      { lat: 43.581, lng: -79.639 }, // Toronto bounding box, southwest corner
      { lat: 43.855, lng: -79.116 }  // Toronto bounding box, northeast corner
    ),
    strictBounds: false,
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) {
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');

    map.panTo(place.geometry.location);
    map.setZoom(16);

    if (searchMarker) {
      searchMarker.setMap(null);
    }
    searchMarker = new google.maps.Marker({
      map,
      position: place.geometry.location,
    });
  });

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    // place_changed only fires when a dropdown suggestion is selected. A
    // bare Enter with no selection means getPlace() has no geometry —
    // treat that as "address not found".
    event.preventDefault();
    const place = autocomplete.getPlace();
    if (!place || !place.geometry) {
      errorEl.classList.remove('hidden');
    }
  });
}
```

Then update `initMap()` to call it:

```js
function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: TORONTO_CENTER,
    zoom: 11,
  });

  loadAllLayers(map).then((failedLayers) => {
    if (failedLayers.length > 0) {
      document.getElementById('layer-error-banner').classList.remove('hidden');
    }
  });

  initLegend();
  initSearch(map);
}
```

- [ ] **Step 2: Verify search works**

Serve the directory and open it in a browser. Type a real Toronto address (e.g. "100 Queen St W") into the search box, select the autocomplete suggestion, and confirm the map pans/zooms to that location with a marker dropped there. Then clear the box, type gibberish (e.g. "asdkjhaskjdh"), and press Enter without selecting a suggestion — confirm the "Address not found." message appears near the search box.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add address search with Places Autocomplete"
```

---

## Task 7: README and end-to-end verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Toronto TTC Ward Map

An interactive map overlaying Toronto's ward boundaries and TTC transit
routes (bus, streetcar, subway) on Google Maps, with address search.

## Setup

1. **Install dependencies** (only needed for the data-prep script):

   ```bash
   npm install
   ```

2. **Get a Google Maps API key** in the [Google Cloud Console](https://console.cloud.google.com/):
   - Enable the **Maps JavaScript API** and the **Places API**.
   - Enable billing on the project (Google requires this even within the free tier).

3. **Configure your API key**:

   ```bash
   cp config.example.js config.js
   ```

   Edit `config.js` and replace `YOUR_API_KEY_HERE` with your key. `config.js`
   is gitignored — it's never committed.

4. **Serve the site locally**:

   ```bash
   npx serve .
   # or: python3 -m http.server 8000
   ```

   Open the printed URL in a browser.

## Regenerating map data

`data/*.geojson` is committed to the repo and loaded directly by the page —
you don't need to regenerate it to run the site. Rerun the prep script only
when Toronto's ward boundaries or the TTC's route network change:

```bash
npm run fetch-data
```

This fetches ward boundaries from the City of Toronto Open Data portal and
route shapes from the TTC's GTFS static feed, and overwrites the files in
`data/`.

## Tests

The GTFS-to-GeoJSON conversion logic (`scripts/lib/gtfs.js`) has unit tests:

```bash
npm test
```

## Manual QA checklist

- [ ] Map loads centered on Toronto with ward boundaries and all three route
      types visible.
- [ ] Each legend checkbox independently shows/hides its layer.
- [ ] Searching a real Toronto address and selecting a suggestion pans/zooms
      the map and drops a marker.
- [ ] Searching a nonsense address and pressing Enter without selecting a
      suggestion shows "Address not found."
- [ ] Temporarily renaming a file in `data/` and reloading shows the
      "Some map layers failed to load" banner; renaming it back and
      reloading makes the banner disappear.
```

- [ ] **Step 2: Run the full manual QA checklist**

Follow every item in the README's "Manual QA checklist" section against a locally served copy of the site (fresh `npm install`, `cp config.example.js config.js` with a real key, `npx serve .`). Confirm each item passes as described.

- [ ] **Step 3: Run the automated test suite one more time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add setup instructions and manual QA checklist"
```

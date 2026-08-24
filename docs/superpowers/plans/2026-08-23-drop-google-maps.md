# Drop Google Maps Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Maps (map, tiles, and Places-based search) with a free, keyless stack — Leaflet + OpenStreetMap tiles + Nominatim geocoding — so the site works for anyone who clones the repo with zero API key, zero billing, and zero account setup.

**Architecture:** `app.js` is rewritten against Leaflet's API in place of the Google Maps JS API; Leaflet's JS/CSS load via CDN `<script>`/`<link>` tags the same way the old Google Maps script tag did. Address search becomes a small hand-built debounced dropdown backed by Nominatim's free public geocoding API. `config.js`/`config.example.js` (the API key files) are deleted outright — nothing replaces them.

**Tech Stack:** Vanilla JS/HTML/CSS (unchanged), Leaflet 1.9.4 (via CDN, no npm dependency), OpenStreetMap standard tiles, OpenStreetMap Nominatim (public geocoding API, no key).

**Spec:** [docs/superpowers/specs/2026-08-23-drop-google-maps-design.md](../specs/2026-08-23-drop-google-maps-design.md)

## Global Constraints

- No framework or build tool — plain HTML/CSS/JS only, served as static files (unchanged from the original spec).
- No backend/server component (unchanged).
- No API key, account, billing, or signup of any kind required by anyone who clones the repo and serves it — this is the entire point of this change.
- Leaflet is loaded via CDN only — do not add it as an npm dependency.
- All four map layers (wards, bus, streetcar, subway) visible by default (unchanged).
- No click-to-inspect interactivity for wards or routes (unchanged).
- Nominatim usage stays within its public usage policy: debounce search input ~300ms, require at least 3 characters before querying, and never fire more than one in-flight request at a time.
- `scripts/`, `data/`, and their tests are untouched by this plan — only `index.html`, `style.css`, `app.js`, `README.md`, `.gitignore`, `config.js`, and `config.example.js` change.

---

## Task 1: Replace Google Maps with Leaflet + OpenStreetMap for map, tiles, and layers

**Files:**
- Delete: `config.js`
- Delete: `config.example.js`
- Modify: `.gitignore`
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: `data/wards.geojson`, `data/routes-bus.geojson`, `data/routes-streetcar.geojson`, `data/routes-subway.geojson` (unchanged paths from the existing project).
- Produces: module-level `map` (now a Leaflet `L.Map` instance) and `mapLayers` (`{ wards, bus, streetcar, subway } -> L.GeoJSON`), both consumed by Task 2's search code in the same file. `initMap()` remains the entry point, but is now called directly at the bottom of the script instead of via Google's async `callback=` pattern.

- [ ] **Step 1: Delete the Google API key files and update `.gitignore`**

```bash
git rm config.js config.example.js
```

Update `.gitignore` to:

```
.superpowers/
node_modules/
```

- [ ] **Step 2: Replace `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Toronto TTC Ward Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin="" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="map"></div>

  <div id="search-box">
    <input id="search-input" type="text" placeholder="Search an address in Toronto"
           aria-label="Search an address in Toronto" />
    <div id="search-error" class="hidden">Address not found.</div>
  </div>

  <div id="legend" role="group" aria-label="Map layers">
    <label><input type="checkbox" data-layer="wards" checked /> Ward boundaries</label>
    <label><input type="checkbox" data-layer="bus" checked /> Bus routes</label>
    <label><input type="checkbox" data-layer="streetcar" checked /> Streetcar routes</label>
    <label><input type="checkbox" data-layer="subway" checked /> Subway lines</label>
  </div>

  <div id="layer-error-banner" class="hidden">Some map layers failed to load.</div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
          crossorigin=""></script>
  <script src="app.js"></script>
</body>
</html>
```

Note what changed from the current file: the `<script src="config.js"></script>` tag is gone (no key to load), a Leaflet CSS `<link>` was added to `<head>`, and the Google Maps script tag is replaced by Leaflet's script tag — Leaflet loads synchronously before `app.js`, so (unlike Google's `callback=initMap` pattern) `app.js` can call its own init function directly once loaded. `#search-input` and `#search-error` are otherwise unchanged; Task 2 adds a results dropdown here.

- [ ] **Step 3: Replace `style.css`**

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

/* #search-box and #legend are pushed into Leaflet's own control stack by
   app.js (which adds the "leaflet-control" class to them there), so
   Leaflet positions and spaces them itself — they only need their own look. */
#search-box {
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

Note what changed: the `margin: 12px` rules on `#search-box`/`#legend` are gone (Leaflet's own `.leaflet-control` CSS handles corner spacing once app.js adds that class), and the comment above them now describes Leaflet instead of Google Maps. Everything else is unchanged. Task 2 will add a `position: relative` rule to `#search-box` and new `#search-results` styles.

- [ ] **Step 4: Replace `app.js`**

```js
// app.js
// Toronto TTC Ward Map — map initialization and GeoJSON layer rendering.
// Built on Leaflet + OpenStreetMap tiles: no API key, no billing, no
// account setup required by anyone who clones this repo.

const DATA_FILES = {
  wards: 'data/wards.geojson',
  bus: 'data/routes-bus.geojson',
  streetcar: 'data/routes-streetcar.geojson',
  subway: 'data/routes-subway.geojson',
};

const LAYER_STYLES = {
  wards: { color: '#4a90d9', weight: 1.5, fillColor: '#4a90d9', fillOpacity: 0.08 },
  bus: { color: '#00923f', weight: 1.5 },
  streetcar: { color: '#d3242c', weight: 2 },
  subway: { color: '#f8c300', weight: 3 },
};

const TORONTO_CENTER = { lat: 43.6532, lng: -79.3832 };

let map;
const mapLayers = {};

function layerCheckbox(key) {
  return document.querySelector(`#legend input[data-layer="${key}"]`);
}

function styleForLayer(key) {
  if (key === 'subway') {
    // Subway features carry their real per-line color (e.g. Line 1 yellow,
    // Line 2 green); the other layers use one flat color per layer.
    return (feature) => ({
      color: (feature.properties && feature.properties.color) || LAYER_STYLES.subway.color,
      weight: LAYER_STYLES.subway.weight,
    });
  }
  return LAYER_STYLES[key];
}

async function loadLayer(map, key) {
  const response = await fetch(DATA_FILES[key]);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${DATA_FILES[key]}: ${response.status}`);
  }
  const geojson = await response.json();
  const dataLayer = L.geoJSON(geojson, { style: styleForLayer(key) });
  // The layer may have been toggled off while it was still loading, so honour
  // the checkbox's current state instead of always attaching. Layers default
  // to visible if the checkbox isn't present for any reason.
  const checkbox = layerCheckbox(key);
  if (!checkbox || checkbox.checked) {
    dataLayer.addTo(map);
  }
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

function initLegend() {
  document.querySelectorAll('#legend input[data-layer]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.layer;
      const layer = mapLayers[key];
      if (!layer) return;
      if (checkbox.checked) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }
    });
  });
}

function addDomAsControl(position, elementId) {
  const control = L.control({ position });
  control.onAdd = () => {
    const el = document.getElementById(elementId);
    el.classList.add('leaflet-control');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    return el;
  };
  control.addTo(map);
}

function initMap() {
  map = L.map('map', { center: TORONTO_CENTER, zoom: 11 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Hand the overlays to Leaflet's own control stack so it reflows its
  // controls (zoom, attribution) around them, instead of them sitting on
  // top of each other — the same lesson learned the hard way with Google
  // Maps' controls, applied up front this time.
  addDomAsControl('topleft', 'search-box');
  addDomAsControl('bottomleft', 'legend');

  loadAllLayers(map).then((failedLayers) => {
    if (failedLayers.length > 0) {
      document.getElementById('layer-error-banner').classList.remove('hidden');
    }
  });

  initLegend();
}

initMap();
```

Note what's deliberately absent from this file for now: `initSearch`, `searchMarker`, and any call to them. Task 2 adds search back. The search input/error elements exist in the DOM (from Step 2) and get pushed into Leaflet's control stack by `addDomAsControl('topleft', 'search-box')`, but nothing is wired to them yet — that's expected and correct for this task.

- [ ] **Step 5: Verify the map, tiles, and layers work**

Run `node --check app.js` to confirm valid syntax.

Serve the directory locally (`npx serve .` or `python3 -m http.server 8000`) and confirm via `curl` that `index.html`, `style.css`, `app.js`, and all four `data/*.geojson` files are served without errors, and that `index.html`'s `<head>`/`<body>` reference the Leaflet CDN URLs and no longer reference `config.js`.

No API key or account is needed anymore, so if you have a way to load the page in a real browser (or a headless one), do that and confirm: the map loads centered on Toronto with OpenStreetMap tiles visible, all four layers render (ward boundaries as translucent blue polygons; bus green, streetcar red, subway multicolored lines), the legend sits bottom-left and the search box top-left without overlapping Leaflet's zoom control or attribution text, and toggling each legend checkbox shows/hides its layer.

If no browser is available in your environment, verify the logic instead with a Node-based stub harness: define a minimal fake `L` global (`L.map`, `L.tileLayer`, `L.geoJSON`, `L.control`, `L.DomEvent` — each a simple function/object that records how it was called and returns a chainable stub with an `addTo`/`on` method as needed) plus a minimal `document`/DOM stub (or `jsdom` installed outside the repo, e.g. in a temp/scratch directory — do not add it as a project dependency), load the real `app.js` source into that context, and confirm: `L.tileLayer` was called with the OpenStreetMap URL and correct attribution string; `loadLayer` fetches all four `DATA_FILES` paths; `addDomAsControl` results in `L.control` being called twice with `{ position: 'topleft' }` and `{ position: 'bottomleft' }`; and toggling a checkbox after a layer has loaded calls `addTo`/`removeLayer` appropriately. Also verify the `#layer-error-banner` path: simulate one `DATA_FILES` fetch failing (e.g. temporarily rename `data/routes-bus.geojson`) and confirm the banner becomes visible while the other three layers still load, then rename the file back.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace Google Maps with Leaflet + OpenStreetMap tiles"
```

---

## Task 2: Replace Google Places search with a Nominatim-backed autocomplete

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: module-level `map` (Task 1's `L.Map` instance).
- Produces: nothing consumed by a later task — this is the last app.js change in this plan.

- [ ] **Step 1: Add the search-results dropdown markup to `index.html`**

In `index.html`, replace the `#search-box` block:

```html
  <div id="search-box">
    <input id="search-input" type="text" placeholder="Search an address in Toronto"
           aria-label="Search an address in Toronto" />
    <div id="search-error" class="hidden">Address not found.</div>
  </div>
```

with:

```html
  <div id="search-box">
    <input id="search-input" type="text" placeholder="Search an address in Toronto"
           aria-label="Search an address in Toronto" autocomplete="off" />
    <ul id="search-results" class="hidden"></ul>
    <div id="search-error" class="hidden">Address not found.</div>
  </div>
```

(`autocomplete="off"` stops the browser's native address-autofill dropdown from clashing with the one this task adds.)

- [ ] **Step 2: Add dropdown styling to `style.css`**

Add `position: relative;` to the existing `#search-box` rule so it is:

```css
#search-box {
  position: relative;
  background: white;
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
```

Then add a new rule block after `#search-error`'s rule and before `#legend`'s rule:

```css
#search-results {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  position: absolute;
  top: 100%;
  left: 8px;
  right: 8px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  max-height: 200px;
  overflow-y: auto;
  z-index: 20;
}

#search-results li {
  padding: 6px 8px;
  font-size: 13px;
  cursor: pointer;
}

#search-results li:hover,
#search-results li.active {
  background: #f0f0f0;
}
```

- [ ] **Step 3: Add search to `app.js`**

Add these constants near the top of `app.js`, after `TORONTO_CENTER`:

```js
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TORONTO_VIEWBOX = '-79.639,43.855,-79.116,43.581'; // left,top,right,bottom
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 3;

function buildNominatimUrl(query) {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    viewbox: TORONTO_VIEWBOX,
    bounded: '1',
    limit: '5',
  });
  return `${NOMINATIM_URL}?${params.toString()}`;
}
```

Add the search implementation after `initLegend()` and before `addDomAsControl`:

```js
let searchMarker = null;
let searchDebounceTimer = null;
let searchRequestToken = 0;

function initSearch(map) {
  const input = document.getElementById('search-input');
  const errorEl = document.getElementById('search-error');
  const resultsEl = document.getElementById('search-results');

  let currentResults = [];
  let activeIndex = -1;

  const showError = () => {
    errorEl.classList.remove('hidden');
  };

  const hideError = () => {
    errorEl.classList.add('hidden');
  };

  const clearResults = () => {
    currentResults = [];
    activeIndex = -1;
    resultsEl.innerHTML = '';
    resultsEl.classList.add('hidden');
  };

  const selectResult = (result) => {
    hideError();
    clearResults();
    input.value = result.display_name;

    const lat = Number(result.lat);
    const lon = Number(result.lon);
    map.setView([lat, lon], 16);

    if (searchMarker) {
      map.removeLayer(searchMarker);
    }
    searchMarker = L.marker([lat, lon]).addTo(map);
  };

  const highlightActive = () => {
    Array.from(resultsEl.children).forEach((li, i) => {
      li.classList.toggle('active', i === activeIndex);
    });
  };

  const renderResults = (results) => {
    currentResults = results;
    activeIndex = -1;
    resultsEl.innerHTML = '';
    if (results.length === 0) {
      resultsEl.classList.add('hidden');
      return;
    }
    results.forEach((result) => {
      const li = document.createElement('li');
      li.textContent = result.display_name;
      li.addEventListener('click', () => selectResult(result));
      resultsEl.appendChild(li);
    });
    resultsEl.classList.remove('hidden');
  };

  const runSearch = async (query) => {
    const token = ++searchRequestToken;
    try {
      const response = await fetch(buildNominatimUrl(query));
      if (!response.ok) {
        throw new Error(`Nominatim request failed: ${response.status}`);
      }
      const results = await response.json();
      if (token !== searchRequestToken) return; // a newer keystroke superseded this request
      if (results.length === 0) {
        clearResults();
        showError();
        return;
      }
      hideError();
      renderResults(results);
    } catch (err) {
      if (token !== searchRequestToken) return;
      console.error(err);
      clearResults();
      showError();
    }
  };

  input.addEventListener('input', () => {
    hideError();
    clearResults();
    clearTimeout(searchDebounceTimer);
    const query = input.value.trim();
    if (query.length < SEARCH_MIN_CHARS) return;
    searchDebounceTimer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && currentResults.length > 0) {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % currentResults.length;
      highlightActive();
      return;
    }
    if (event.key === 'ArrowUp' && currentResults.length > 0) {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length;
      highlightActive();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(searchDebounceTimer);
    if (activeIndex >= 0 && currentResults[activeIndex]) {
      selectResult(currentResults[activeIndex]);
      return;
    }
    const query = input.value.trim();
    if (!query || query.length < SEARCH_MIN_CHARS) {
      showError();
      return;
    }
    runSearch(query);
  });

  document.addEventListener('click', (event) => {
    if (!resultsEl.contains(event.target) && event.target !== input) {
      clearResults();
    }
  });
}
```

Then update `initMap()` to call it — add `initSearch(map);` right after `initLegend();`, so the function reads:

```js
function initMap() {
  map = L.map('map', { center: TORONTO_CENTER, zoom: 11 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  addDomAsControl('topleft', 'search-box');
  addDomAsControl('bottomleft', 'legend');

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

Run `node --check app.js`.

Make exactly ONE real request to Nominatim to confirm the endpoint and query shape actually work (respect the usage policy — this is a single manual check, not a loop):

```bash
curl -s "https://nominatim.openstreetmap.org/search?format=json&q=100+Queen+St+W+Toronto&viewbox=-79.639,43.855,-79.116,43.581&bounded=1&limit=5" | node -e "const d=JSON.parse(require('fs').readFileSync(0)); console.log(Array.isArray(d), d.length, d[0] && d[0].display_name, d[0] && d[0].lat, d[0] && d[0].lon)"
```

Expected: `true`, a count > 0, and a real address/lat/lon printed — confirming the response shape (`display_name`, `lat`, `lon` fields) matches what `selectResult`/`renderResults` expect.

If you have a way to load the page in a real or headless browser, do that and confirm: typing 3+ characters of a real Toronto address shows a dropdown of suggestions after a brief pause; clicking one pans/zooms the map and drops a marker; typing gibberish shows "Address not found."; arrow keys move a highlight through the dropdown and Enter selects the highlighted item; clicking outside the dropdown closes it.

If no browser is available, verify the debounce/keyboard/dropdown logic with the same kind of stub harness used in Task 1 (fake `L.marker`, a DOM stub for `#search-input`/`#search-error`/`#search-results`, and a stubbed `fetch` returning canned Nominatim-shaped JSON) — confirm: a fetch fires only after the debounce delay and only once the query is 3+ characters; a stale response (simulated by resolving an earlier request after a later one has already started) is discarded via the `searchRequestToken` check; selecting a result calls `map.setView` with the right `[lat, lon]` and creates exactly one marker, removing the previous one on a second selection; and zero results (or a rejected fetch) shows the "Address not found." message.

- [ ] **Step 3: Commit**

```bash
git add index.html style.css app.js
git commit -m "feat: add Nominatim-backed address search"
```

---

## Task 3: Update README — remove all Google API key setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# Toronto TTC Ward Map

An interactive map overlaying Toronto's ward boundaries and TTC transit
routes (bus, streetcar, subway) on OpenStreetMap, with address search.
Built on Leaflet and OpenStreetMap's Nominatim — no API key, no billing,
and no account signup required to run it.

## Setup

1. **Install dependencies** (only needed for the data-prep script):

   ```bash
   npm install
   ```

2. **Serve the site locally**:

   ```bash
   npx serve .
   # or: python3 -m http.server 8000
   ```

   Open the printed URL in a browser. That's it — no API key, no config
   file, no account of any kind.

## Deploying

The site is plain static files, so any static host works (GitHub Pages,
Netlify, Cloudflare Pages, S3, …) — just push the files. There's no key to
provision and nothing to keep secret.

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

Since this site needs no account setup, you can run this checklist
immediately after cloning:

- [ ] Map loads centered on Toronto with ward boundaries and all three route
      types visible.
- [ ] Each legend checkbox independently shows/hides its layer.
- [ ] Searching a real Toronto address shows a dropdown of suggestions;
      selecting one pans/zooms the map and drops a marker.
- [ ] Searching a nonsense address shows "Address not found."
- [ ] Temporarily renaming a file in `data/` and reloading shows the
      "Some map layers failed to load" banner; renaming it back and
      reloading makes the banner disappear.
```

- [ ] **Step 2: Verify the README's commands are accurate**

Run `npm install` and `npm test` from the repo root and confirm both succeed as described. Confirm `data/` still contains all four `*.geojson` files as the "Regenerating map data" section describes, and that no reference to `config.js`, `config.example.js`, or any Google API key remains anywhere in the file (`grep -i "google\|api key\|config.js" README.md` should return nothing).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: remove Google API key setup, document keyless setup"
```

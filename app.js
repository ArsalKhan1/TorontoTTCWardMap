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
  initSearch(map);
}

initMap();

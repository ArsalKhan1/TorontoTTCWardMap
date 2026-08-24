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

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

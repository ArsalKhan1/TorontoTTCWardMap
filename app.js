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

const SEARCH_NOT_FOUND_MESSAGE = 'Address not found.';
const SEARCH_UNAVAILABLE_MESSAGE =
  'Search is unavailable. Your Google Cloud project may need the classic ' +
  'Places API (not just Places API (New)) enabled — see README.';

let map;
const mapLayers = {};

function layerCheckbox(key) {
  return document.querySelector(`#legend input[data-layer="${key}"]`);
}

async function loadLayer(map, key) {
  const response = await fetch(DATA_FILES[key]);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${DATA_FILES[key]}: ${response.status}`);
  }
  const geojson = await response.json();
  const dataLayer = new google.maps.Data();
  if (key === 'subway') {
    // Subway features carry their real per-line color (e.g. Line 1 yellow,
    // Line 2 green); the other layers use one flat color per layer.
    dataLayer.setStyle((feature) => ({
      strokeColor: feature.getProperty('color') || LAYER_STYLES.subway.strokeColor,
      strokeWeight: LAYER_STYLES.subway.strokeWeight,
    }));
  } else {
    dataLayer.setStyle(LAYER_STYLES[key]);
  }
  dataLayer.addGeoJson(geojson);
  // The layer may have been toggled off while it was still loading, so honour
  // the checkbox's current state instead of always attaching. Layers default
  // to visible if the checkbox isn't present for any reason.
  const checkbox = layerCheckbox(key);
  dataLayer.setMap(checkbox && !checkbox.checked ? null : map);
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
      layer.setMap(checkbox.checked ? map : null);
    });
  });
}

let searchMarker = null;

function initSearch(map) {
  const input = document.getElementById('search-input');
  const errorEl = document.getElementById('search-error');

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  };

  const hideError = () => {
    errorEl.classList.add('hidden');
  };

  // google.maps.places.Autocomplete is the *legacy* Places widget. Google
  // restricted the legacy Places API to pre-existing customers in March 2025,
  // so a Cloud project created after that may only have "Places API (New)"
  // available and constructing/using this widget can fail. Surface that
  // clearly instead of leaving a dead-looking search box behind.
  const disableSearch = (err) => {
    console.error('Places Autocomplete is unavailable:', err);
    input.disabled = true;
    showError(SEARCH_UNAVAILABLE_MESSAGE);
  };

  let autocomplete;
  try {
    autocomplete = new google.maps.places.Autocomplete(input, {
      bounds: new google.maps.LatLngBounds(
        { lat: 43.581, lng: -79.639 }, // Toronto bounding box, southwest corner
        { lat: 43.855, lng: -79.116 }  // Toronto bounding box, northeast corner
      ),
      strictBounds: false,
    });
  } catch (err) {
    disableSearch(err);
    return;
  }

  autocomplete.addListener('place_changed', () => {
    try {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) {
        showError(SEARCH_NOT_FOUND_MESSAGE);
        return;
      }
      hideError();

      map.panTo(place.geometry.location);
      map.setZoom(16);

      if (searchMarker) {
        searchMarker.setMap(null);
      }
      searchMarker = new google.maps.Marker({
        map,
        position: place.geometry.location,
      });
    } catch (err) {
      disableSearch(err);
    }
  });

  // Typing again means the previous "Address not found." is stale.
  input.addEventListener('input', hideError);

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    // place_changed only fires when a dropdown suggestion is selected. A
    // bare Enter with no selection means getPlace() has no geometry —
    // treat that as "address not found".
    event.preventDefault();
    if (!input.value.trim()) return;
    try {
      const place = autocomplete.getPlace();
      if (!place || !place.geometry) {
        showError(SEARCH_NOT_FOUND_MESSAGE);
      }
    } catch (err) {
      disableSearch(err);
    }
  });
}

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: TORONTO_CENTER,
    zoom: 11,
  });

  // Hand the overlays to Maps' own control stack so it reflows its controls
  // around them — otherwise the search box sits on top of the Map/Satellite
  // buttons (TOP_LEFT) and the legend covers the Google attribution
  // (BOTTOM_LEFT), which the Maps Platform Terms don't allow.
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(
    document.getElementById('search-box')
  );
  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(
    document.getElementById('legend')
  );

  loadAllLayers(map).then((failedLayers) => {
    if (failedLayers.length > 0) {
      document.getElementById('layer-error-banner').classList.remove('hidden');
    }
  });

  initLegend();
  initSearch(map);
}

function loadGoogleMapsScript() {
  // libraries=places is loaded now so the search box (added in Task 6)
  // doesn't need a second script tag or a page reload.
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places&loading=async`;
  script.async = true;
  document.head.appendChild(script);
}

window.initMap = initMap;
loadGoogleMapsScript();

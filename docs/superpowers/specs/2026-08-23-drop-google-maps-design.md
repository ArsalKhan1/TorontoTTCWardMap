# Drop Google Maps Dependency — Design Spec

**Date:** 2026-08-23
**Status:** Approved for implementation planning
**Supersedes (in part):** [2026-08-22-ward-transit-map-design.md](2026-08-22-ward-transit-map-design.md) — that spec's Architecture, Map Rendering & Layers, Search, and Error Handling sections are replaced by this one. Its Purpose, Success Criteria (map/layer/toggle/search functionality), Non-Goals, Data Pipeline, and Testing posture stand unchanged and are not repeated here except where this change alters them.

## Purpose

The current site requires a real, billing-enabled Google Maps API key just to load the map at all, and a second (Places) API enablement for search — both are a real barrier to anyone who clones this repo, and the last implementation round shipped with an explicitly unresolved risk that the search feature might silently not work on a freshly created Google Cloud project. This change removes Google Maps entirely and replaces it with a free, keyless stack: Leaflet + OpenStreetMap tiles for the map, and OpenStreetMap's Nominatim for address search. Anyone who clones the repo and serves it locally sees a fully working map and search with zero account setup, zero billing, and zero API keys.

## Success Criteria

- Cloning the repo and serving `index.html` locally shows a working map, with all four layers and address search, with no API key, no config file, and no third-party account signup of any kind.
- All success criteria from the original spec still hold: ward boundaries + all three TTC route types visible by default, legend toggles per layer, address search pans/zooms to a result with a marker, static hosting still works with no server component.
- `config.js`/`config.example.js` and all API-key setup steps are gone from the codebase and the README.

## Non-Goals

(Unchanged from the original spec.) No click-to-inspect popups, no councillor/election data, no GTFS-realtime data, no backend.

Additionally, out of scope for this change: matching Google's exact visual style, self-hosting/vendoring map tiles or the Nominatim service, and any UI beyond a simple dropdown-style autocomplete for search (no map markers preview, no "did you mean" fuzzy correction beyond what Nominatim itself returns).

## Architecture

Plain static HTML/CSS/JS, unchanged in kind — still no framework, no build tool, no backend. `app.js` is rewritten against Leaflet instead of the Google Maps JS API. Leaflet's JS/CSS are loaded via CDN `<script>`/`<link>` tags in `index.html`, the same pattern the old Google Maps script tag used — no npm dependency, no vendoring. `config.js`, `config.example.js`, and the `.gitignore` entry for `config.js` are deleted; nothing replaces them, since no key or secret exists anywhere in this project after this change.

```
TorontoTTCWardMap/
├── index.html          — page shell: map div, Leaflet CDN tags (no config.js script tag)
├── style.css            — layout/legend/search styling (Leaflet controls need less custom positioning CSS)
├── app.js                — map init, layer loading, toggle wiring, Nominatim-backed search
├── data/                 — unchanged (wards.geojson, routes-{bus,streetcar,subway}.geojson)
├── scripts/               — unchanged (fetch-data.js, lib/gtfs.js, lib/gtfs.test.js)
└── README.md              — setup instructions with the API-key step removed
```

## Map Rendering & Layers

- `app.js` initializes `L.map('map').setView([43.6532, -79.3832], 11)` and adds an `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 })`.
- Each of the four GeoJSON files loads into its own `L.geoJSON(...)` layer via the same `fetch()` + `response.ok` check + per-layer try/catch pattern used today, so one bad fetch still can't take down the other three layers or block the page. Styling (fill/stroke colors and weights per layer, plus the subway layer's per-feature real-line-color styling) carries over via Leaflet's `style` option, which — like the current `google.maps.Data#setStyle` usage — accepts either a static style object or a per-feature style function.
- Legend checkboxes toggle layers via `map.addLayer(layer)` / `map.removeLayer(layer)`. Each layer is constructed detached (not added to the map at creation) and attached based on the current state of its checkbox once loading completes, preserving the toggle-during-load race fix from the last review round.
- The search box and legend become real Leaflet controls (`L.Control` subclasses or `L.control({position: ...})` instances added via `.addTo(map)`) positioned `topleft`/`bottomleft`, rather than plain absolutely-positioned `<div>`s. This lets Leaflet auto-stack them with its own zoom control and attribution instead of overlapping them — the same class of bug fixed for Google's controls last round, addressed at the architecture level this time instead of after the fact.
- `#layer-error-banner` stays a plain overlay `<div>`, unchanged — it's centered top, not in a corner Leaflet manages.

## Search

- `initSearch(map)` is rewritten as a small hand-built autocomplete, since no equivalent to Google's Places Autocomplete widget ships with Nominatim:
  - On input, debounce ~300ms and require at least 3 characters before querying, to stay well under Nominatim's ~1 request/second usage-policy limit; cancel/ignore a stale in-flight request if a newer keystroke supersedes it.
  - Query `https://nominatim.openstreetmap.org/search?format=json&q=<query>&viewbox=-79.639,43.855,-79.116,43.581&bounded=1&limit=5` (viewbox = Toronto's bounding box, same box used by the old Google Autocomplete bias).
  - Render up to 5 results as a simple dropdown list under the search input; support both mouse click and arrow-key+Enter selection.
  - Selecting a result calls `map.setView([lat, lon], 16)` and drops/replaces a single marker (`L.marker([lat, lon]).addTo(map)`, removing the previous one first) — identical behavior to today's pan/zoom/marker.
  - No results, a failed fetch, or Enter pressed with nothing selected all show the existing "Address not found." message (`#search-error`) — one unified failure path, simpler than the current code's split between "invalid place" and the hardened "search unavailable" path, since Nominatim has no billing/enablement failure mode to distinguish from a genuine no-match.
- Browsers block scripts from setting a custom `User-Agent` header; Nominatim's usage policy accepts the browser's automatically-sent `Referer` header as sufficient client identification for this kind of client-side usage, so no extra code is needed to comply with it.

## Error Handling

- **Layer load failures**: unchanged — per-layer try/catch feeding `#layer-error-banner`, exactly as today.
- **Geocoding failures**: collapsed to the single "Address not found." message described above (network error, non-OK response, or genuinely zero results all land here) — no separate "service unavailable" messaging is needed since there's no key/billing/enablement failure mode to distinguish.
- **Missing/invalid setup**: no longer applicable — there is nothing to configure, so no failure mode exists here anymore. The corresponding "Missing/invalid Google Maps API key" subsection from the original spec is deleted outright, not replaced.

## Data Pipeline & Testing

Unchanged from the original spec — `scripts/fetch-data.js` and `scripts/lib/gtfs.js` are untouched by this change, and their existing unit tests continue to cover the same logic. The browser-side map/search behavior remains manually verified per the original spec's Testing section, but — unlike before — that manual verification is now actually runnable by anyone immediately, with no external account setup required first.

## README Changes

- Delete the "Get a Google Maps API key" step and the `config.js`/`config.example.js` setup step entirely.
- Setup becomes: `npm install` (still needed for the data-prep script), then serve the directory locally — no account, no billing, no key.
- The "Deploying" section drops the API-key-provisioning-per-deploy-target guidance and the public-key/HTTP-referrer-restriction guidance, since neither applies anymore; deploying becomes "push the static files to any static host," full stop.
- The Manual QA checklist is unchanged in content (same five items: layers visible by default, legend toggles, search pan/zoom+marker, invalid address message, layer-load-failure banner) but gets a note that it can now be run by anyone with zero setup.

## Removed From the Project

`config.js`, `config.example.js`, the `.gitignore` entry for `config.js`, the Google Maps/Places script-loading code in `app.js`, and every README section related to obtaining, configuring, restricting, or deploying a Google API key.

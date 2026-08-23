# Toronto TTC Ward Map — Design Spec

**Date:** 2026-08-22
**Status:** Approved for implementation planning

## Purpose

A static web page that overlays Toronto's political ward boundaries and the
TTC's transit routes (bus, streetcar, subway) on Google Maps, with an address
search box that pans/zooms the map to a searched location. This is a visual
reference tool — no per-feature click interactivity, no backend, no user
accounts.

## Success Criteria

- Loading the page shows a Google Map of Toronto with ward boundaries and all
  three TTC route types visible by default.
- A legend panel lets the user independently toggle each of the four layers
  (wards, bus, streetcar, subway) on/off.
- Typing an address into the search box and selecting a result pans and zooms
  the map to that location and drops a marker there.
- The page has no server component — it can be hosted as static files (e.g.
  GitHub Pages) and works entirely client-side, aside from calls to the
  Google Maps/Places APIs.
- Ward and route geometry ship as static GeoJSON files in the repo, generated
  by a rerunnable prep script rather than fetched live on every page load.

## Non-Goals

- No click-to-inspect info popups for wards or routes (pure visual overlay).
- No councillor data, election data, or ridership/complaint analytics.
- No live GTFS realtime data (vehicle positions, delays) — routes are static
  line geometry only.
- No backend, database, or user accounts.

## Architecture

Plain static HTML/CSS/JS site using the Google Maps JavaScript API. No
framework, no build tool. Ward and route geometry are pre-converted to
GeoJSON once (and re-generated only when source data changes) by a one-time
Node prep script, then checked into the repo and loaded by the page at
runtime as static files.

```
TorontoTTCWardMap/
├── index.html          — page shell: map div, search box, legend panel
├── style.css            — layout/legend/search styling
├── app.js                — map init, layer loading, toggle wiring, search wiring
├── data/
│   ├── wards.geojson              — 25 Toronto ward boundaries
│   ├── routes-bus.geojson         — TTC bus routes (LineStrings)
│   ├── routes-streetcar.geojson   — TTC streetcar routes
│   └── routes-subway.geojson      — TTC subway lines
├── scripts/
│   └── fetch-data.js     — one-time/rerunnable prep script (Node): pulls ward
│                            boundaries from Toronto Open Data and route shapes
│                            from the TTC GTFS static feed, converts to the
│                            GeoJSON files above
└── README.md              — setup instructions (API key, how to rerun prep script)
```

Everything under `data/` is generated but committed to the repo, so the
deployed site never depends on the prep script running at request time — it's
a dev-time tool rerun only when the TTC network changes.

## Data Pipeline (`scripts/fetch-data.js`)

- **Wards**: fetched from the City of Toronto Open Data portal's ward
  boundary dataset via its CKAN API (GeoJSON export), used close to as-is.
- **TTC routes**: fetched from the TTC's published GTFS static feed (a zip of
  CSVs: `routes.txt`, `shapes.txt`, `trips.txt`). The script parses these,
  joins each route to its shape(s), classifies by GTFS `route_type` (0 =
  streetcar, 1 = subway, 3 = bus), and emits one LineString-per-route GeoJSON
  `Feature` into the corresponding output file. Each feature is tagged with
  route short name, long name, and color for styling/legend use.
- Rerunning the script overwrites the `data/*.geojson` files. This happens
  occasionally (e.g. when TTC updates its network), not on every deploy.

## Map Rendering & Layers

- `app.js` loads the Google Maps JS API and initializes a map centered on
  Toronto.
- Each GeoJSON file loads into its own `google.maps.Data` layer instance (4
  total: wards, bus, streetcar, subway), so each can be shown/hidden
  independently.
- Styling: wards render as translucent fill + outline in a single neutral
  color (no per-ward distinction, since click interactivity is out of
  scope). Bus/streetcar/subway each get a distinct line color/weight,
  loosely following TTC's real line colors for the subway.
- A legend panel (fixed corner overlay) lists the four layers with
  checkboxes; toggling a checkbox calls `.setMap(...)` on/off for that
  layer. All layers are visible by default.

## Search

- The search box uses the Google Places Autocomplete widget, biased to the
  Toronto area, positioned as an overlay on the map.
- Selecting a result pans/zooms the map to that location and drops a marker
  (moved/cleared on the next search). No ward/route lookup is performed on
  the result — the user reads that off the visible map layers.

## Error Handling

- **No address match**: Autocomplete naturally limits suggestions to valid
  places; if the user presses Enter without selecting a suggestion, show a
  small inline "address not found" message near the search box.
- **GeoJSON layer fails to load** (bad path, network failure): log to the
  console and show a small non-blocking banner ("Some map layers failed to
  load") rather than leaving a silently incomplete map.
- **Missing/invalid Google Maps API key**: covered by Google's own SDK error
  overlay. The README documents required setup (API key, enabling the Maps
  JavaScript API and Places API in Google Cloud Console).

## Testing

This is primarily a static rendering page, so most verification is manual
(page loads, layers render, toggles work, search pans correctly). The one
piece of real logic is the GTFS → GeoJSON conversion in `fetch-data.js`:
route-classification (by `route_type`) and shape-joining logic get unit
tests (Node's built-in test runner) run against small fixture data, not the
live feed.

## Open Items for Future Iterations (explicitly out of scope now)

- Click-to-inspect popups for ward/route info.
- Councillor/election data layer.
- Live GTFS-realtime vehicle positions or delay data.

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

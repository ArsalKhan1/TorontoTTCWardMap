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

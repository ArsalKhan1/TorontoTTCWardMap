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

   > **⚠️ Heads up on the Places API — test search first.** Google restricted
   > the legacy Places API to pre-existing customers in March 2025, so a Cloud
   > project you create today may only offer **Places API (New)**. This
   > codebase's search box uses the classic `google.maps.places.Autocomplete`
   > widget, which **Places API (New) does not serve**. In the Cloud Console's
   > API library, search for "Places API" and enable the **legacy** one (it's a
   > separate entry from "Places API (New)"). If that entry isn't offered on
   > your project, the code needs migrating to
   > `google.maps.places.PlaceAutocompleteElement`.
   >
   > Because of this, **type an address into the search box right after setup**,
   > before anything else. If search is broken you'll see "Search is
   > unavailable…" under the box (and details in the browser console) — that
   > means the classic Places API isn't enabled.

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

## Deploying

The site is plain static files, so any static host works (GitHub Pages,
Netlify, Cloudflare Pages, S3, …). Two things need care:

### 1. `config.js` is gitignored — you must supply it on the deploy target

`config.js` holds your API key and is deliberately kept out of the repo's
history. That means a plain `git push`-based deploy (e.g. GitHub Pages serving
the repo as-is) will **404 on `config.js` and load the map with
`key=undefined`** — a broken map. There is no build step in this project to
generate it for you, so pick one of:

- Commit a deploy-only `config.js` to a **private** repo/branch that you deploy
  from.
- Use your host's environment/secret injection, if it has one (e.g. a Netlify
  build command that writes `config.js` from an env var).
- Upload `config.js` manually alongside the other static files after each
  deploy.

### 2. The deployed key is public — restrict it

Anything in `config.js` ships to the browser, so **the API key is visible in
the page source to anyone who visits**. That's unavoidable for a client-side
Maps app; the mitigation is to make a scraped key useless elsewhere. In the
Cloud Console under **APIs & Services → Credentials → your key**:

- **Application restrictions → HTTP referrers (web sites)**: list only your
  deployed domain(s), e.g. `https://yourname.github.io/*` (add
  `http://localhost:*/*` while developing).
- **API restrictions → Restrict key**: allow only the **Maps JavaScript API**
  and the **Places API**.

Also keep billing alerts/quotas on the project so a leaked key can't run up a
surprise bill.

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

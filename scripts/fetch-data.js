#!/usr/bin/env node
// One-time/rerunnable data-prep script. Fetches ward boundaries from Toronto
// Open Data and TTC route shapes from the TTC's GTFS static feed, and writes
// static GeoJSON into data/. Rerun this only when source data changes —
// the deployed site reads the committed output, not this script.

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const { groupRoutesByLayer } = require('./lib/gtfs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WARDS_PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=city-wards';
const GTFS_PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ttc-routes-and-schedules';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseCsv(text) {
  return parse(text, { columns: true, skip_empty_lines: true });
}

async function fetchWards() {
  const pkg = await fetchJson(WARDS_PACKAGE_URL);
  const resource = pkg.result.resources.find(
    (r) => r.format.toUpperCase() === 'GEOJSON' && r.name.includes('4326')
  );
  if (!resource) {
    throw new Error('Could not find a WGS84 (4326) GeoJSON resource for city-wards');
  }
  const geojson = await fetchJson(resource.url);
  fs.writeFileSync(path.join(DATA_DIR, 'wards.geojson'), JSON.stringify(geojson, null, 2));
  console.log(`Wrote data/wards.geojson (${geojson.features.length} features)`);
}

async function fetchRoutes() {
  const pkg = await fetchJson(GTFS_PACKAGE_URL);
  const resource = pkg.result.resources.find((r) => r.format.toUpperCase() === 'ZIP');
  if (!resource) {
    throw new Error('Could not find the GTFS zip resource for ttc-routes-and-schedules');
  }

  const zipBuffer = await fetchBuffer(resource.url);
  const zip = new AdmZip(zipBuffer);

  const routes = parseCsv(zip.readAsText('routes.txt'));
  const trips = parseCsv(zip.readAsText('trips.txt'));
  const shapes = parseCsv(zip.readAsText('shapes.txt'));

  const layers = groupRoutesByLayer({ routes, trips, shapes });

  for (const [layer, features] of Object.entries(layers)) {
    const geojson = { type: 'FeatureCollection', features };
    const outPath = path.join(DATA_DIR, `routes-${layer}.geojson`);
    fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
    console.log(`Wrote data/routes-${layer}.geojson (${features.length} features)`);
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await fetchWards();
  await fetchRoutes();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

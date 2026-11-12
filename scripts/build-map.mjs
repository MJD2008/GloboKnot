// Builds the maps used by the site (TopoJSON, Natural Earth via world-atlas, public domain):
// - public/data/world.json: countries at 1:50m, simplified so it stays light on phones. Feature ids are
//   ISO 3166-1 numeric codes, like countries.json's `num`.
// - public/data/globe.json: land only at 1:110m, for the turning globe on the start screen.
// Run: node scripts/build-map.mjs
import fs from 'node:fs/promises';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { quantize } from 'topojson-client';

const root = new URL('..', import.meta.url).pathname;
const src = JSON.parse(await fs.readFile(root + 'node_modules/world-atlas/countries-50m.json', 'utf8'));
let topo = presimplify(src);
topo = simplify(topo, quantile(topo, 0.2)); // keeps the most important ~20% of points; zoomed views stay smooth
topo.arcs = topo.arcs.map(arc => arc.map(([x, y]) => [x, y])); // drop the simplification weights
topo = quantize(topo, 5e4); // integer, delta-encoded coordinates: much smaller file
delete topo.objects.land;
for (const g of topo.objects.countries.geometries) {
  g.properties = { n: g.properties?.name ?? '' }; // English name, only for unscored map areas (e.g. Kosovo)
}
const out = JSON.stringify(topo);
await fs.mkdir(root + 'public/data', { recursive: true });
await fs.writeFile(root + 'public/data/world.json', out);
console.log(`public/data/world.json: ${(out.length / 1024).toFixed(0)} KB`);

const land = JSON.parse(await fs.readFile(root + 'node_modules/world-atlas/land-110m.json', 'utf8')); // already quantized
const globe = JSON.stringify(land);
await fs.writeFile(root + 'public/data/globe.json', globe);
console.log(`public/data/globe.json: ${(globe.length / 1024).toFixed(0)} KB`);

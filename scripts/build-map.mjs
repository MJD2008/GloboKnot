// Builds the maps used by the site (TopoJSON, Natural Earth via world-atlas, public domain):
// - public/data/world.json: countries at 1:50m, simplified so it stays light on phones. Feature ids are
//   ISO 3166-1 numeric codes, like countries.json's `num`.
// - public/data/globe.json: the land and the countries at 1:110m, for the turning globe on the start screen (the
//   countries light up there once tied; the smallest have no shape at this scale and show as a dot instead).
// Run: node scripts/build-map.mjs
import fs from 'node:fs/promises';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature, quantize } from 'topojson-client';
import { geoArea } from 'd3-geo';

const root = new URL('..', import.meta.url).pathname;
const src = JSON.parse(await fs.readFile(root + 'node_modules/world-atlas/countries-50m.json', 'utf8'));
let topo = presimplify(src);
const keep = quantile(topo, 0.2); // keeps the most important ~20% of points; zoomed views stay smooth
// Small countries keep every point. Simplified with the rest, Malta, Singapore, the Maldives and most island nations
// fell to a single point and showed as an empty ring at sea (found checking a note of James on Malta, 16 Nov 2026).
// Under 5,000 km² this adds about 10 KB.
const SMALL = 5000; // km²
const km2 = new Map();
for (const f of feature(src, src.objects.countries).features) if (f.id != null) km2.set(f.id, (km2.get(f.id) ?? 0) + geoArea(f) * 6371 ** 2);
const arcsOf = g => (g.type === 'Polygon' ? g.arcs.flat() : g.type === 'MultiPolygon' ? g.arcs.flat(2) : []);
for (const g of topo.objects.countries.geometries) {
  if (g.id == null || km2.get(g.id) >= SMALL) continue;
  for (const a of arcsOf(g)) for (const p of topo.arcs[a < 0 ? ~a : a]) p[2] = Infinity;
}
topo = simplify(topo, keep);
topo.arcs = topo.arcs.map(arc => arc.map(([x, y]) => [x, y])); // drop the simplification weights
topo = quantize(topo, 5e4); // integer, delta-encoded coordinates: much smaller file
delete topo.objects.land;
// One shape per country code. Natural Earth gives some territories their country's code: Ashmore and Cartier Islands,
// a reef off Western Australia, is 036 like Australia, and a second shape with the same code replaced the mainland, so
// Australia's map centred on the Timor Sea (James, 16 Nov 2026). The parts are joined into one country.
const parts = g => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []);
const byId = new Map();
topo.objects.countries.geometries = topo.objects.countries.geometries.filter(g => {
  if (g.id == null) return true;
  const first = byId.get(g.id);
  if (!first) { byId.set(g.id, g); return true; }
  first.arcs = [...parts(first), ...parts(g)];
  first.type = 'MultiPolygon';
  return false;
});
for (const g of topo.objects.countries.geometries) {
  g.properties = { n: g.properties?.name ?? '' }; // English name, only for unscored map areas (e.g. Kosovo)
}
const out = JSON.stringify(topo);
await fs.mkdir(root + 'public/data', { recursive: true });
await fs.writeFile(root + 'public/data/world.json', out);
console.log(`public/data/world.json: ${(out.length / 1024).toFixed(0)} KB`);

const small = JSON.parse(await fs.readFile(root + 'node_modules/world-atlas/countries-110m.json', 'utf8')); // already quantized
for (const g of small.objects.countries.geometries) delete g.properties; // the ids are enough
const globe = JSON.stringify(small);
await fs.writeFile(root + 'public/data/globe.json', globe);
console.log(`public/data/globe.json: ${(globe.length / 1024).toFixed(0)} KB`);

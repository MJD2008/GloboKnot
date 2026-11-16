// The lights on the night side of the home globe (preview 16, James: "With night and day and lights too?"): every
// town and city in Natural Earth's populated places (1:10m, public domain) with at least 10,000 people, biggest first.
// Each is three whole numbers: longitude and latitude in twentieths of a degree, and how big it is, 0 (10,000 people)
// to 99 (about 40 million), on a log scale.
// Run: node scripts/build-lights.mjs (after node scripts/fetch-sources.mjs)
import fs from 'node:fs';

const SRC = new URL('../sources/cache/ne-populated-places.geojson', import.meta.url).pathname;
const OUT = new URL('../public/data/lights.json', import.meta.url).pathname;
const MIN = 10_000;
const SCALE = 20;

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const places = [];
for (const f of src.features) {
  const pop = Math.max(f.properties.pop_max ?? 0, f.properties.pop_min ?? 0);
  if (!(pop >= MIN) || f.geometry?.type !== 'Point') continue;
  const [lon, lat] = f.geometry.coordinates;
  const size = Math.round(Math.min(1, Math.max(0, (Math.log10(pop) - 4) / 3.6)) * 99);
  places.push({ lon: Math.round(lon * SCALE), lat: Math.round(lat * SCALE), size, pop });
}
places.sort((a, b) => b.pop - a.pop);
const lights = places.flatMap(p => [p.lon, p.lat, p.size]);
fs.writeFileSync(OUT, JSON.stringify({ scale: SCALE, lights }) + '\n');
console.log(`${places.length} lights, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);

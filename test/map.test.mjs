// The quiz map (public/data/world.json, built by scripts/build-map.mjs, drawn by src/scripts/map.ts): one shape per
// country code, every country in the knowledge base drawn with some land, and every country's map showing the country
// and its capital's dot. Two bugs this guards against, both found 16 Nov 2026: Australia's map centred on the Timor
// Sea (a reef with Australia's code replaced the mainland), and Malta, Singapore and most island nations were simplified
// away to a single point, an empty ring at sea.
// Run: node --test (Node 22.18 or newer reads the TypeScript sources directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { feature } from 'topojson-client';
import { geoArea, geoDistance } from 'd3-geo';

const read = f => JSON.parse(fs.readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const data = read('countries.json');
const world = read('world.json');
const byNum = new Map(feature(world, world.objects.countries).features.map(f => [String(f.id), f]));
const KM2 = 6371 ** 2;
/** Countries with no shape at 1:50m: their map is a ring around their position. */
const SHAPELESS = ['TUV'];
const skip = process.features.typescript ? false : 'needs a Node that reads TypeScript (22.18 or newer)';

test('one shape per country code', () => {
  for (const f of [world, read('globe.json')]) {
    const ids = f.objects.countries.geometries.map(g => g.id).filter(id => id != null);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  }
});

test('every country is drawn with land', () => {
  for (const c of data.countries) {
    const f = byNum.get(c.num);
    if (SHAPELESS.includes(c.id)) { assert.equal(f, undefined, `${c.id} has a shape now: take it out of SHAPELESS`); continue; }
    assert.ok(f, `${c.id} has no shape`);
    assert.ok(geoArea(f) * KM2 > 0.2, `${c.id} (${c.name}) is drawn with no land`);
  }
  assert.ok(geoArea(byNum.get('036')) * KM2 > 7e6, "Australia's shape is its mainland");
});

test("every country's map shows the country and its capital", { skip }, async () => {
  const { WorldMap } = await import('../src/scripts/map.ts');
  const { Knowledge } = await import('../src/scripts/kb.ts');
  const kb = new Knowledge(data);
  const map = new WorldMap(world);
  const svg = { setAttribute() {}, innerHTML: '', parentElement: null, getBoundingClientRect: () => ({ width: 640 }) };
  const deg = (a, ll) => geoDistance(a, [ll[1], ll[0]]) * 180 / Math.PI;
  for (const c of kb.countries) {
    const caps = kb.mainCapitals(c.id);
    const dot = caps.length === 1 ? kb.cities.find(x => x.id === caps[0])?.ll : undefined;
    map.render(svg, { num: c.num, ll: c.ll, dot });
    const { center, radius } = map.view; // the view reaches `radius` degrees up and down, more to the sides
    assert.ok(deg(center, c.ll) < radius * 0.9, `${c.id} (${c.name}): the map is centred away from it`);
    if (dot) assert.ok(deg(center, dot) < radius * 0.9, `${c.id} (${c.name}): the capital's dot is out of view`);
  }
});

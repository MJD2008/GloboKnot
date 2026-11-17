// Practice sets (src/scripts/sets.ts): one per category (James, 16 Nov 2026). Each region holds what the quiz can ask
// there, every item can be found by typing its answer, maps go by name, and one item at a time is asked: the next one
// by itself (nextItem), a continent at a time on a map, round to the earliest still to find on cards.
// Run: node --test (Node 22.18 or newer, which reads the TypeScript sources directly).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const skip = process.features.typescript ? false : 'needs a Node that reads TypeScript (22.18 or newer)';
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
  value: { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });

async function load() {
  const S = await import('../src/scripts/sets.ts');
  const q = await import('../src/scripts/questions.ts');
  const { Knowledge } = await import('../src/scripts/kb.ts');
  const kb = new Knowledge(JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8')));
  const pools = { country: kb.countries, city: kb.cities, language: kb.languages, peak: kb.peaks, river: kb.rivers };
  return { ...S, q, kb, pools };
}

test('six sets, one per category, in every region', { skip }, async () => {
  const { SETS, REGIONS, setItems, practicePlaces, q, kb } = await load();
  assert.deepEqual(SETS.map(s => s.cat), q.CATS.map(c => c.id), 'one set per category, in the same order');
  for (const s of SETS) {
    for (const region of REGIONS) {
      const items = setItems(kb, { set: s.id, region });
      assert.equal(items.length, q.available(kb, { kinds: [s.kind], places: practicePlaces(kb, region), size: 0 }), `${s.id} in ${region}: what the quiz asks there`);
      assert.equal(new Set(items.map(it => it.key)).size, items.length, `${s.id} in ${region}: each once`);
    }
  }
  assert.equal(setItems(kb, { set: 'countries', region: 'world' }).length, 194);
});

test('every item can be found by typing its answer', { skip }, async () => {
  const { SETS, setItems, nameIndex, kb, pools } = await load();
  const { norm } = await import('../scripts/lib/text.mjs');
  for (const s of SETS) {
    const items = setItems(kb, { set: s.id, region: 'world' }), index = nameIndex(items, pools[s.pool]);
    items.forEach((it, j) => {
      const names = it.accept.flatMap(id => { const e = pools[s.pool].find(x => x.id === id); return e ? [e.name, ...e.aliases] : []; });
      assert.ok(names.some(n => index.get(norm(n))?.includes(j)), `${s.id}: ${it.answer} can't be typed`);
    });
  }
  // One answer finds every item it answers: Mont Blanc is the highest point of France and of Italy.
  const peaks = setItems(kb, { set: 'peaks', region: 'Europe' }), index = nameIndex(peaks, pools.peak);
  const both = index.get('mont blanc') ?? [];
  assert.deepEqual(both.map(j => peaks[j].key).sort(), ['FRA', 'ITA']);
});

test('maps go by name; flags are the whole world; records keep their names', { skip }, async () => {
  const { setItems, practiceKey, regionFor, kb } = await load();
  const caps = setItems(kb, { set: 'capitals', region: 'Europe' }).map(it => it.clue);
  assert.deepEqual(caps, [...caps].sort((a, b) => a.localeCompare(b)));
  assert.equal(regionFor('flags', 'Africa'), 'world', 'flags: "they should not be organised by continent"');
  assert.equal(regionFor('capitals', 'Africa'), 'Africa');
  assert.equal(practiceKey({ set: 'capitals', region: 'Europe' }), 'C-eu-f', 'records are kept under this name: never change it');
  assert.equal(practiceKey({ set: 'countries', region: 'world' }), 'L-w-f');
});

test('on the map, every country, capital and highest point has a place and a continent', { skip }, async () => {
  const { setItems, kb } = await load();
  for (const set of ['countries', 'capitals', 'peaks']) {
    for (const it of setItems(kb, { set, region: 'world' })) {
      assert.ok(it.num && it.ll && it.ll.every(Number.isFinite), `${set}: ${it.key} has no place`);
      assert.ok(it.cont, `${set}: ${it.key} has no continent`);
      if (set !== 'countries') assert.ok(it.marks?.length, `${set}: ${it.key} has no ${set === 'capitals' ? 'capital' : 'peak'} on the map`);
    }
  }
  const za = setItems(kb, { set: 'capitals', region: 'Africa' }).find(it => it.key === 'ZAF');
  assert.equal(za.marks.length, 3, 'South Africa: Pretoria, Cape Town and Bloemfontein, each with its dot');
});

test('the next one asked: cards go on and come round to the earliest; maps walk to the nearest, a continent at a time', { skip }, async () => {
  const { setItems, nextItem, arc, kb } = await load();
  // Cards: the next still to find after it; after the last, the earliest still to find, not the first.
  const cards = setItems(kb, { set: 'flags', region: 'world' }), n = cards.length, found = cards.map(() => false);
  assert.equal(nextItem(cards, found, -1), 0, 'it starts with the first');
  assert.equal(nextItem(cards, found, 0), 1);
  found[0] = found[1] = found[2] = true;
  assert.equal(nextItem(cards, found, n - 1), 3, 'after the last: the earliest still to find (James: "rather than restarting from the beginning")');
  assert.equal(nextItem(cards, found, 5), 6);
  const all = cards.map(() => true);
  assert.equal(nextItem(cards, all, 4), -1, 'all found: nothing more');
  const one = cards.map((_, i) => i !== 7);
  assert.equal(nextItem(cards, one, 7), 7, 'the last one left stays');
  // A map: the nearest still to find, in the same continent while there is one.
  const world = setItems(kb, { set: 'countries', region: 'world' }), f = world.map(() => false);
  const at = id => world.findIndex(it => it.key === id);
  const next = j => world[nextItem(world, f, j)].key;
  assert.equal(next(at('BEL')), 'NLD', 'Brussels: Amsterdam is the nearest capital');
  f[at('NLD')] = true;
  assert.equal(next(at('BEL')), 'LUX', 'then Luxembourg');
  // From Madrid, Rabat (Morocco) is nearer than Lisbon is far... but Europe is finished first.
  const europe = world.map((it, i) => i).filter(i => world[i].cont === 'Europe');
  const f3 = world.map(() => false);
  for (const i of europe) f3[i] = world[i].key !== 'PRT';
  assert.equal(world[nextItem(world, f3, at('ESP'))].key, 'PRT', 'a continent is finished first, even when another is nearer');
  // Skipped ones come last, in the order they were skipped.
  const g = world.map(() => true);
  ['FRA', 'DEU', 'ITA'].forEach(id => (g[at(id)] = false));
  assert.equal(world[nextItem(world, g, at('FRA'), [at('DEU')])].key, 'ITA', 'Germany was skipped: Italy first');
  g[at('ITA')] = true;
  assert.equal(world[nextItem(world, g, at('FRA'), [at('DEU')])].key, 'DEU', 'then Germany again');
  assert.ok(arc([50.85, 4.35], [49.61, 6.13]) < 2, 'arc: Brussels to Luxembourg is under 2 degrees');
});

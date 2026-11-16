// Practice sets (src/scripts/sets.ts): one per category, filled in at once (James, 16 Nov 2026). Each region holds
// what the quiz can ask there, every item can be found by typing its answer, and a set keeps its order, so it can be
// learnt. Run: node --test (Node 22.18 or newer, which reads the TypeScript sources directly).
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

test('a set keeps its order; lists go by name', { skip }, async () => {
  const { setItems, practiceKey, kb } = await load();
  const flags = p => setItems(kb, p).map(it => it.key);
  assert.deepEqual(flags({ set: 'flags', region: 'Africa' }), flags({ set: 'flags', region: 'Africa' }));
  const caps = setItems(kb, { set: 'capitals', region: 'Europe' }).map(it => it.clue);
  assert.deepEqual(caps, [...caps].sort((a, b) => a.localeCompare(b)));
  assert.equal(practiceKey({ set: 'capitals', region: 'Europe' }), 'C-eu-f', 'records are kept under this name: never change it');
  assert.equal(practiceKey({ set: 'countries', region: 'world' }), 'L-w-f');
});

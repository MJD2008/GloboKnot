// The three levels. Easy keeps to well-known places for as long as it can, Medium mixes, Hard goes for the
// lesser-known; a level ticks its own question types; All (The Gordian Knot) and the Daily have no level.
// Run: node --test (Node 22.18 or newer, which reads the TypeScript sources directly).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const skip = process.features.typescript ? false : 'needs a Node that reads TypeScript (22.18 or newer)';
// The round builder rests questions seen recently, which it keeps in localStorage: give it one.
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
  value: { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });

async function load() {
  const q = await import('../src/scripts/questions.ts');
  const { Knowledge } = await import('../src/scripts/kb.ts');
  const kb = new Knowledge(JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8')));
  const byId = Object.fromEntries(q.TEMPLATES.map(t => [t.id, t]));
  const known = x => byId[x.kind].core(kb, x.subject);
  /** `n` rounds one after another, each remembered as the site does; returns every question asked. */
  const rounds = (sel, n, name) => {
    store.clear();
    const out = [];
    for (let i = 0; i < n; i++) {
      const round = q.buildRound(kb, sel, q.seeded(`${name}${i}`), false, `s${i}`);
      q.remember(round.map(x => x.key));
      out.push(round);
    }
    return out;
  };
  const share = rs => { const all = rs.flat(); return all.filter(known).length / all.length; };
  return { ...q, kb, known, rounds, share };
}

test('each level ticks its own question types', { skip }, async () => {
  const { LEVELS, LEVEL_IDS, TEMPLATES, isCustom } = await load();
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  const cats = l => [...new Set(LEVELS[l].kinds.map(k => TEMPLATES.find(t => t.id === k).cat))].sort();
  assert.deepEqual(cats('easy'), ['capitals', 'flags', 'locations']);
  assert.equal(LEVELS.easy.kinds.length, TEMPLATES.filter(t => ['capitals', 'flags', 'locations'].includes(t.cat)).length);
  for (const l of ['medium', 'hard']) assert.equal(LEVELS[l].kinds.length, TEMPLATES.length);
  for (const l of LEVEL_IDS) {
    const kinds = LEVELS[l].kinds;
    assert.equal(isCustom({ kinds, places: [], size: 10, level: l }), false, `${l}: its own types are not custom`);
    assert.equal(isCustom({ kinds: [...kinds].reverse(), places: ['FRA'], size: 20, level: l }), false, `${l}: order, places and size don't matter`);
    assert.equal(isCustom({ kinds: kinds.slice(1), places: [], size: 10, level: l }), true, `${l}: a type less is custom`);
  }
  assert.equal(isCustom({ kinds: [...LEVELS.easy.kinds, 'river.name'], places: [], size: 10, level: 'easy' }), true, 'a type more is custom');
});

test('Easy asks about well-known places only', { skip }, async () => {
  const { LEVELS, known, rounds } = await load();
  for (const size of [10, 20, 50]) {
    const rs = rounds({ kinds: LEVELS.easy.kinds, places: [], size, level: 'easy' }, 40, `easy${size}`);
    assert.ok(rs.every(r => r.length === size), `size ${size}: full rounds`);
    assert.deepEqual(rs.flat().filter(x => !known(x)).map(x => x.key), [], `size ${size}: nothing obscure, also once the famous ones were seen recently`);
  }
});

test('Easy with other question types keeps to the well-known too', { skip }, async () => {
  const { known, rounds } = await load();
  for (const kinds of [['river.name', 'river.map'], ['peak.name', 'peak.map'], ['lang.text', 'lang.official']]) {
    const rs = rounds({ kinds, places: [], size: 10, level: 'easy' }, 8, kinds[0]);
    assert.deepEqual(rs.flat().filter(x => !known(x)).map(x => x.key), [], kinds.join(' + '));
  }
});

test('Easy in a small region: the well-known first, then the others fill the round', { skip }, async () => {
  const { LEVELS, kb, known, rounds } = await load();
  const oceania = kb.countries.filter(c => kb.continent(c.id) === 'Oceania').map(c => c.id);
  const core = oceania.filter(id => kb.country(id).tier === 'core');
  assert.ok(core.length > 0 && core.length < 10, 'Oceania has a few well-known countries, fewer than a round');
  for (const round of rounds({ kinds: LEVELS.easy.kinds, places: oceania, size: 10, level: 'easy' }, 10, 'oceania')) {
    assert.equal(round.length, 10, 'the round is still full');
    assert.equal(round.filter(known).length, core.length, 'every well-known country is in it');
    assert.ok(round.slice(0, core.length).every(known), 'and they come first');
  }
});

test('Medium is mostly well-known, Hard mostly not', { skip }, async () => {
  const { LEVELS, rounds, share } = await load();
  const of = level => share(rounds({ kinds: LEVELS[level].kinds, places: [], size: 20, level }, 60, level));
  const medium = of('medium'), hard = of('hard');
  assert.ok(medium > 0.5 && medium < 0.7, `Medium: ${Math.round(medium * 100)}% well-known`);
  assert.ok(hard > 0.1 && hard < 0.3, `Hard: ${Math.round(hard * 100)}% well-known`);
});

test('no level is Medium, and the Daily has none', { skip }, async () => {
  const { ALL_KINDS, DAILY, buildRound, kb, seeded } = await load();
  store.clear();
  const keys = sel => buildRound(kb, sel, seeded('same'), true, 'same').map(x => x.key);
  assert.deepEqual(keys({ kinds: ALL_KINDS, places: [], size: 20 }), keys({ kinds: ALL_KINDS, places: [], size: 20, level: 'medium' }));
  assert.equal(DAILY.level, undefined);
});

test('All (The Gordian Knot) asks everything, whatever the level', { skip }, async () => {
  const { available, buildRound, kb, seeded } = await load();
  const europe = kb.countries.filter(c => kb.continent(c.id) === 'Europe').map(c => c.id);
  const keys = level => buildRound(kb, { kinds: ['cap.name', 'flag.pick'], places: europe, size: 0, level }, seeded('all'), false, 'all').map(x => x.key);
  const easy = keys('easy');
  assert.equal(easy.length, available(kb, { kinds: ['cap.name', 'flag.pick'], places: europe, size: 0 }));
  assert.deepEqual(easy, keys('hard'));
  assert.deepEqual(easy, keys(undefined));
});

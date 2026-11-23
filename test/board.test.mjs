// The Gordian Knot's board (worker/, James, 22 Nov 2026): the names it takes, and the server's answer check. The
// challenge is the same set of questions every time, so a run can be checked at all; a run that really answered every
// question right is never refused, whichever right name was typed; a run with a question missing, twice, or wrong is.
// Run: node --test (Node 22.18 or newer, which reads the TypeScript sources directly).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveFor } from '../scripts/lib/match.mjs';

const skip = process.features.typescript ? false : 'needs a Node that reads TypeScript (22.18 or newer)';
// The round builder rests questions seen recently, which it keeps in localStorage: give it one.
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
  value: { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });

test('names: tidied, and the ones that won’t do refused', { skip }, async () => {
  const { cleanName, sameName, NAME_MAX } = await import('../src/scripts/board-name.ts');
  assert.equal(cleanName('  Ada   Lovelace '), 'Ada Lovelace');
  assert.equal(cleanName('Zoë'), 'Zoë', 'one form of every accented letter');
  for (const ok of ['Zoë', '李华', 'O\'Brien', 'J.-P. Sartre', 'x_9', 'Ελένη', 'a'.repeat(NAME_MAX)]) {
    assert.equal(cleanName(ok), ok, ok);
  }
  for (const bad of ['', '   ', 'a'.repeat(NAME_MAX + 1), 'www.x.com', 'see x.com', 'https x', 'a<b>', 'ok \u{1F642}', 'tab\u0000', 42, null, undefined]) {
    assert.equal(cleanName(bad), null, JSON.stringify(bad));
  }
  assert.ok(sameName('Ada L', 'ada l'));
  assert.ok(!sameName('Ada', 'Ada L'));
});

test('The Gordian Knot: the same questions every time, typed, and a real 100% run is never refused', { skip }, async () => {
  const q = await import('../src/scripts/questions.ts');
  const { Knowledge } = await import('../src/scripts/kb.ts');
  const { allRight } = await import('../worker/check.ts');
  const kb = new Knowledge(JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8')));
  const pools = { country: kb.countries, city: kb.cities, language: kb.languages, peak: kb.peaks, river: kb.rivers };
  const round = seed => { store.clear(); return q.buildRound(kb, q.GORDIAN, q.seeded(seed), false, seed); };
  const a = round('a'), b = round('b');
  const keys = r => r.map(x => x.key).sort();
  assert.deepEqual(keys(a), keys(b), 'the same questions from one run to the next');
  assert.equal(new Set(keys(a)).size, a.length, 'no two questions share a key');
  assert.ok(a.every(x => x.format === 'type'), 'every question typed');

  // the answer key, as scripts/build-answers.mjs makes it for the server
  const right = {};
  for (const x of a) right[x.key] = [...new Set(x.pools.flatMap(p => pools[p]).filter(e => x.accept.includes(e.id)).map(e => e.name))];

  // What the browser sends: for each question, the entity its matcher found for what was typed (app.ts, answer()).
  // Every right answer, by its name or any other name it goes by, must be matched as right, and accepted.
  const misses = [];
  const sent = a.map(x => {
    const pool = x.pools.flatMap(p => pools[p]);
    let first = null;
    for (const e of pool.filter(e => x.accept.includes(e.id))) {
      for (const typed of [e.name, ...(e.aliases ?? [])]) {
        const hit = resolveFor(typed, pool, x.accept);
        if (!hit || !x.accept.includes(hit.id) || !allRight([[x.key, hit.name]], { [x.key]: right[x.key] }, 1)) misses.push(`${x.key}: "${typed}"`);
        else first ??= hit.name;
      }
    }
    return [x.key, first];
  });
  assert.deepEqual(misses, [], 'right answers the server would refuse');
  assert.ok(allRight(sent, right, a.length), 'a full run, every answer right');
  assert.ok(allRight([...sent].reverse(), right, a.length), 'in any order');
  assert.ok(allRight(sent.map(([k, s]) => [k, s.toUpperCase()]), right, a.length), 'in other case');

  // and what it refuses
  assert.ok(!allRight(sent.slice(1), right, a.length), 'one question missing');
  assert.ok(!allRight([...sent.slice(1), sent[1]], right, a.length), 'one question twice');
  assert.ok(!allRight(sent.map(([k, s], i) => [k, i === 7 ? 'Atlantis' : s]), right, a.length), 'one wrong');
  assert.ok(!allRight(sent.map(([k, s], i) => [k, i === 7 ? '' : s]), right, a.length), 'one left empty');
  const j = sent.findIndex(([k, s]) => !right[sent[0][0]].includes(s) && !right[k].includes(sent[0][1]));
  const swapped = sent.map(([k, s], i) => [k, i === 0 ? sent[j][1] : i === j ? sent[0][1] : s]);
  assert.ok(!allRight(swapped, right, a.length), 'two answers swapped');
  assert.ok(!allRight([['__proto__', 'x'], ...sent.slice(1)], right, a.length), 'a question that isn’t one');
  assert.ok(!allRight([['constructor', 'Function'], ...sent.slice(1)], right, a.length), 'a question that isn’t one');

  // the server takes a body of at most 400 KB, keys under 60 characters, answers under 120 (worker/index.ts)
  const body = JSON.stringify({ key: '0'.repeat(32), run: '0'.repeat(32), name: 'a'.repeat(20), ms: 1, answers: sent });
  assert.ok(body.length < 400_000, `a full run is ${body.length} bytes`);
  assert.ok(sent.every(([k, s]) => k.length < 60 && s.length < 120));
});

// The round builder. The four levels: Easy asks about famous countries only and shows four options far apart,
// Medium keeps to well-known places, typed or picked, Hard mixes in lesser-known ones and Impossible goes for them,
// both typed. A level picks its own question types and answers; All (The Gordian Knot) asks everything, typed. Every
// question type can be typed or picked. And what a round never does: ask about the same country or river twice.
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
  const fame = x => byId[x.kind].fame(kb, x.subject);
  const known = x => fame(x) >= 1;
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
  const level = (l, more = {}) => ({ kinds: q.LEVELS[l].kinds, places: [], size: 10, level: l, ...more });
  return { ...q, kb, byId, fame, known, rounds, share, level };
}

test('each level picks its own question types and answers', { skip }, async () => {
  const { LEVELS, LEVEL_IDS, TEMPLATES, isCustom } = await load();
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard', 'impossible']);
  const cats = l => [...new Set(LEVELS[l].kinds.map(k => TEMPLATES.find(t => t.id === k).cat))].sort();
  assert.deepEqual(cats('easy'), ['capitals', 'flags']);
  assert.deepEqual(cats('medium'), ['capitals', 'flags', 'languages', 'locations']);
  for (const l of ['hard', 'impossible']) assert.equal(LEVELS[l].kinds.length, TEMPLATES.length);
  assert.deepEqual(LEVEL_IDS.map(l => LEVELS[l].answers), ['choose', 'both', 'type', 'type']);
  for (const l of LEVEL_IDS) {
    const kinds = LEVELS[l].kinds;
    assert.equal(isCustom({ kinds, places: [], size: 10, level: l }), false, `${l}: its own types are not custom`);
    assert.equal(isCustom({ kinds: [...kinds].reverse(), places: ['FRA'], size: 20, level: l }), false, `${l}: order, places and size don't matter`);
    assert.equal(isCustom({ kinds, places: [], size: 10, level: l, answers: LEVELS[l].answers }), false, `${l}: its own answers are not custom`);
    assert.equal(isCustom({ kinds: kinds.slice(1), places: [], size: 10, level: l }), true, `${l}: a type less is custom`);
    assert.equal(isCustom({ kinds, places: [], size: 10, level: l, answers: l === 'easy' ? 'type' : 'choose' }), true, `${l}: other answers are custom`);
  }
  assert.equal(isCustom({ kinds: [...LEVELS.easy.kinds, 'river.name'], places: [], size: 10, level: 'easy' }), true, 'a type more is custom');
});

test('Easy asks about famous countries only, as long as a round can', { skip }, async () => {
  const { fame, level, rounds } = await load();
  for (const size of [10, 20]) {
    const rs = rounds(level('easy', { size }), 40, `easy${size}`);
    assert.ok(rs.every(r => r.length === size), `size ${size}: full rounds`);
    assert.deepEqual(rs.flat().filter(x => fame(x) < 2).map(x => x.key), [], `size ${size}: only famous, also once they were all seen recently`);
  }
  // 37 famous countries, and none comes up twice: a round of 50 goes on with the well-known ones.
  for (const round of rounds(level('easy', { size: 50 }), 5, 'easy50')) {
    assert.equal(round.length, 50);
    const f = round.map(fame);
    assert.deepEqual(f, [...f].sort((a, b) => b - a), 'the famous first, then the well-known, then the rest');
  }
});

test('Easy shows four options, far apart and familiar', { skip }, async () => {
  const { kb, level, rounds } = await load();
  let options = 0, near = 0, obscure = 0;
  for (const x of rounds(level('easy', { size: 20 }), 30, 'easyopts').flat()) {
    assert.equal(x.format, 'choice', x.key);
    assert.equal(x.choices.length, 4, x.key);
    assert.equal(x.choices.filter(c => x.accept.includes(c.id)).length, 1, `${x.key}: one right option`);
    const subject = x.countries[0];
    for (const c of x.choices) {
      if (x.accept.includes(c.id)) continue;
      const id = kb.country(c.id) ? c.id : kb.get(c.id)?.country; // a country, or a capital's country
      options++;
      if (kb.continent(id) === kb.continent(subject)) near++;
      if (kb.country(id).tier === 'other') obscure++;
    }
  }
  assert.ok(near / options < 0.2, `${Math.round((near / options) * 100)}% of wrong options on the same continent`);
  assert.ok(obscure / options < 0.1, `${Math.round((obscure / options) * 100)}% of wrong options lesser known`);
});

test('Medium keeps to well-known places, typed and picked', { skip }, async () => {
  const { known, level, rounds } = await load();
  const all = rounds(level('medium', { size: 20 }), 30, 'medium').flat();
  assert.deepEqual(all.filter(x => !known(x)).map(x => x.key), []);
  const picked = all.filter(x => x.format === 'choice').length / all.length;
  assert.ok(picked > 0.1 && picked < 0.4, `${Math.round(picked * 100)}% picked`);
});

test('Hard is mostly well-known, Impossible mostly not, both typed', { skip }, async () => {
  const { level, rounds, share } = await load();
  const of = l => rounds(level(l, { size: 20 }), 60, l);
  const hard = of('hard'), impossible = of('impossible');
  assert.ok(share(hard) > 0.5 && share(hard) < 0.7, `Hard: ${Math.round(share(hard) * 100)}% well-known`);
  assert.ok(share(impossible) > 0.1 && share(impossible) < 0.3, `Impossible: ${Math.round(share(impossible) * 100)}% well-known`);
  for (const x of [...hard, ...impossible].flat()) assert.equal(x.format, x.kind === 'flag.pick' ? 'choice' : 'type', x.key);
});

test('every question type can be typed or picked', { skip }, async () => {
  const { TEMPLATES, buildRound, kb, seeded } = await load();
  for (const t of TEMPLATES) {
    for (const answers of ['type', 'choose', 'both']) {
      for (const lvl of ['easy', 'medium', 'hard']) {
        store.clear();
        const round = buildRound(kb, { kinds: [t.id], places: [], size: 30, level: lvl, answers }, seeded(`${t.id}${answers}${lvl}`), true, 'x');
        assert.ok(round.length >= 10, `${t.id} ${answers} ${lvl}: ${round.length} questions`);
        const want = answers === 'both' ? t.natural : answers === 'choose' || !t.typable ? 'choice' : 'type';
        for (const x of round) {
          assert.equal(x.format, want, `${x.key} ${answers}`);
          if (want === 'type') { assert.equal(x.choices, undefined); continue; }
          assert.equal(x.choices.length, 4, `${x.key}: four options`);
          assert.equal(new Set(x.choices.map(c => c.label)).size, 4, `${x.key}: four different names`);
          assert.equal(x.choices.filter(c => x.accept.includes(c.id)).length, 1, `${x.key}: one right option`);
          assert.equal(x.answer, x.choices.find(c => x.accept.includes(c.id)).label, `${x.key}: the answer is the right option`);
        }
      }
    }
  }
});

test('a level-less selection is Hard; the Daily is Medium, every category, typed or picked', { skip }, async () => {
  const { ALL_KINDS, DAILY, askOf, buildRound, kb, seeded } = await load();
  store.clear();
  const keys = sel => buildRound(kb, sel, seeded('same'), true, 'same').map(x => `${x.key}:${x.format}`);
  assert.deepEqual(keys({ kinds: ALL_KINDS, places: [], size: 20 }), keys({ kinds: ALL_KINDS, places: [], size: 20, level: 'hard' }));
  assert.equal(DAILY.level, 'medium');
  assert.deepEqual(askOf(DAILY), { answers: 'both', tempt: 1 });
  assert.equal(DAILY.kinds.length, ALL_KINDS.length);
});

test('All (The Gordian Knot) asks everything, typed, whatever the level', { skip }, async () => {
  const { GORDIAN, askOf, available, buildRound, kb, seeded } = await load();
  const europe = kb.countries.filter(c => kb.continent(c.id) === 'Europe').map(c => c.id);
  const keys = level => buildRound(kb, { kinds: ['cap.name', 'flag.pick'], places: europe, size: 0, level }, seeded('all'), false, 'all').map(x => x.key);
  const easy = keys('easy');
  assert.equal(easy.length, available(kb, { kinds: ['cap.name', 'flag.pick'], places: europe, size: 0 }));
  assert.deepEqual(easy, keys('impossible'));
  assert.deepEqual(easy, keys(undefined));
  assert.deepEqual(askOf({ ...GORDIAN, level: 'easy', answers: 'choose' }), { answers: 'type', tempt: 2 });
  assert.ok(available(kb, GORDIAN) > 2000, 'every question in the game');
});

test('a challenge link gets the same questions, asked the same way', { skip }, async () => {
  const { askOf, buildRound, codeOf, kb, level, rebuildRound, seeded } = await load();
  for (const l of ['easy', 'medium', 'hard']) {
    store.clear();
    const sel = level(l, { kinds: ['loc.map', 'cap.name', 'flag.pick', 'lang.official', 'river.map'], size: 20 });
    const round = buildRound(kb, sel, seeded(l), true, `seed-${l}`);
    const again = rebuildRound(kb, round.map(x => ({ code: codeOf(x.kind), subject: x.subject })), `seed-${l}`, askOf(sel));
    assert.deepEqual(again, round, l);
  }
});

test('a round never asks about the same country or river twice', { skip }, async () => {
  const { ALL_KINDS, LEVEL_IDS, rounds } = await load();
  const twice = xs => xs.filter((x, i) => xs.indexOf(x) !== i);
  for (const [name, kinds] of [['every type', ALL_KINDS], ['rivers', ['river.name', 'river.map']], ['capitals', ['cap.name', 'cap.map', 'cap.reverse']]]) {
    for (const level of LEVEL_IDS) {
      for (const round of rounds({ kinds, places: [], size: 50, level }, 12, `twice${name}${level}`)) {
        assert.equal(round.length, 50, `${name}, ${level}: a full round`);
        assert.deepEqual(twice(round.flatMap(x => x.countries)), [], `${name}, ${level}: a country twice`);
        assert.deepEqual(twice(round.filter(x => x.cat === 'rivers').map(x => x.subject)), [], `${name}, ${level}: a river twice`);
      }
    }
  }
});

// The round builder. The four levels: Easy asks about famous countries only and shows four options far apart,
// Medium keeps to well-known places, typed or picked, Hard mixes in lesser-known ones and Impossible goes for them,
// both typed. A level picks its own question types and answers; All (The Gordian Knot) asks everything, typed. Every
// question type can be typed or picked. And what a round never does: ask about the same country or river twice. Practice
// asks every question of one type in one region, in the same order every time. On Hard and Impossible the wrong
// options of a flag question are flags that look alike. The Daily climbs from Easy to Impossible.
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

test('Hard and Impossible offer flags that look alike as wrong options; Easy never does', { skip }, async () => {
  const { kb, level, rounds } = await load();
  const alikeShare = sel => {
    let options = 0, alike = 0;
    for (const x of rounds(sel, 30, `flags${sel.level}`).flat()) {
      const like = new Set(kb.flagsLike(x.subject).filter(([, d]) => d < 0.7).map(([o]) => o));
      for (const c of x.choices) if (!x.accept.includes(c.id)) { options++; if (like.has(c.id)) alike++; }
    }
    return alike / options;
  };
  const flags = { kinds: ['flag.name', 'flag.pick'], answers: 'choose' };
  const hard = alikeShare(level('hard', flags)), medium = alikeShare(level('medium', flags));
  assert.ok(hard > 0.5, `Hard: ${Math.round(hard * 100)}% of wrong flags look alike`);
  assert.ok(medium < hard - 0.25, `Medium: ${Math.round(medium * 100)}% (only by chance, from nearby)`);
  assert.deepEqual(kb.flagsLike('TCD').slice(0, 2).map(([o]) => o), ['ROU', 'BEL'], "Chad's flag looks most like Romania's");
  const easy = rounds(level('easy', flags), 30, 'flagseasy').flat();
  const close = easy.flatMap(x => x.choices.filter(c => kb.flagsLike(x.subject).some(([o, d]) => o === c.id && d < 0.45)).map(c => `${x.subject}:${c.id}`));
  assert.ok(easy.length >= 300, `${easy.length} Easy flag questions`);
  assert.deepEqual(close, [], 'Easy: no flag among the options looks like the right one');
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

test('a level-less selection is Hard', { skip }, async () => {
  const { ALL_KINDS, buildRound, kb, seeded } = await load();
  store.clear();
  const keys = sel => buildRound(kb, sel, seeded('same'), true, 'same').map(x => `${x.key}:${x.format}`);
  assert.deepEqual(keys({ kinds: ALL_KINDS, places: [], size: 20 }), keys({ kinds: ALL_KINDS, places: [], size: 20, level: 'hard' }));
});

test('the Daily climbs: two questions from each level, Easy to Impossible, every category, the same for everyone', { skip }, async () => {
  const { CATS, DAILY, DAILY_LEVELS, LEVELS, byId, codeOf, dailyRound, fame, kb, rebuildRound, remember } = await load();
  assert.deepEqual(DAILY_LEVELS, ['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'impossible', 'impossible']);
  assert.equal(DAILY.size, 8);
  const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10));
  const kinds = new Map();
  for (const day of days) {
    const seed = `daily-${day}`;
    store.clear();
    const round = dailyRound(kb, seed);
    assert.equal(round.length, 8, `${day}: eight questions`);
    assert.deepEqual(round.map(x => x.level), DAILY_LEVELS, `${day}: Easy first, Impossible last`);
    for (const x of round) {
      assert.ok(LEVELS[x.level].kinds.includes(x.kind), `${day}: ${x.key} is one of ${x.level}'s question types`);
      assert.deepEqual(x.ask, { answers: LEVELS[x.level].answers, tempt: LEVELS[x.level].tempt }, `${day}: ${x.key} asked as ${x.level} asks`);
      kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
    }
    for (const x of round.slice(0, 2)) assert.ok(x.format === 'choice' && fame(x) === 2, `${day}: Easy picks from four, famous only (${x.key})`);
    for (const x of round.slice(2, 4)) assert.ok(fame(x) >= 1, `${day}: Medium keeps to well-known places (${x.key})`);
    for (const x of round.slice(4)) assert.equal(x.format, byId[x.kind].typable ? 'type' : 'choice', `${day}: Hard and Impossible are typed (${x.key})`);
    assert.equal(new Set(round.map(x => x.cat)).size, CATS.length, `${day}: every category`);
    const countries = round.flatMap(x => x.countries);
    assert.equal(new Set(countries).size, countries.length, `${day}: no country twice`);
    // the same for everyone: what one played before doesn't change it
    remember(round.map(x => x.key));
    assert.deepEqual(dailyRound(kb, seed).map(x => x.key), round.map(x => x.key), `${day}: the same again`);
  }
  assert.equal(kinds.size, 13, `every question type comes up in three months (${[...kinds].join(' ')})`);
  assert.notDeepEqual(dailyRound(kb, 'daily-2026-11-13').map(x => x.key), dailyRound(kb, 'daily-2026-11-14').map(x => x.key));
  // a link to a Daily brings back the same questions, each asked its level's way
  const round = dailyRound(kb, 'daily-2026-11-13');
  const items = round.map(x => ({ code: codeOf(x.kind), subject: x.subject }));
  assert.deepEqual(rebuildRound(kb, items, 'daily-2026-11-13', round.map(x => x.ask), round.map(x => x.level)), round);
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
    assert.ok(round.every(x => x.ask.answers === askOf(sel).answers && x.ask.tempt === askOf(sel).tempt), `${l}: each question knows how it was asked`);
    const again = rebuildRound(kb, round.map(x => ({ code: codeOf(x.kind), subject: x.subject })), `seed-${l}`, round.map(x => x.ask));
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

test('Practice asks every question of one type in one region, in the same order every time', { skip }, async () => {
  const { available, kb, practiceAsk, practiceRound } = await load();
  const sa = kb.countries.filter(c => kb.continent(c.id) === 'South America').map(c => c.id);
  const typed = practiceRound(kb, 'cap.name', sa, 'type', 'p-C-sa-t');
  assert.deepEqual(practiceRound(kb, 'cap.name', sa, 'type', 'p-C-sa-t'), typed, 'the same seed: the same questions, order and all');
  assert.equal(typed.length, available(kb, { kinds: ['cap.name'], places: sa, size: 0 }), 'every question there is');
  assert.ok(typed.every(x => x.format === 'type' && sa.includes(x.subject)));
  const picked = practiceRound(kb, 'cap.name', sa, 'choose', 'p-C-sa-c');
  assert.ok(picked.every(x => x.format === 'choice' && x.choices.length === 4), 'picked: four options each');
  assert.notDeepEqual(picked.map(x => x.subject), typed.map(x => x.subject), 'another practice, another order');
  assert.deepEqual(practiceAsk('type', 'flag.pick'), { answers: 'choose', tempt: 1 }, 'a flag to find is always picked');
  const flags = practiceRound(kb, 'flag.name', [], 'type', 'p-F-w-t');
  assert.equal(new Set(flags.map(x => x.subject)).size, kb.countries.length, 'the whole world: every flag once');
});

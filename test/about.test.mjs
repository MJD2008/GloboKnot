// Every country has a description and one fact on its sheet (James, 22 Nov 2026: "a short description and an
// interesting fact per country"; 23 Nov 2026: "Could the descriptions be a bit longer? 2-10 sentences, depending on
// how much there is to say about the country."), and the built sheet data carries them as written.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { parseCsv } from '../scripts/lib/csv.mjs';
import { paragraphs, sentences } from '../src/scripts/paragraphs.ts';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const about = YAML.parse(read('data/countries/about.yaml'));
const ids = parseCsv(read('data/countries/countries.csv')).map(r => r.id);
const sheets = JSON.parse(read('public/data/sheets.json'));

test('every country has a description and a fact, and nothing else is there', () => {
  assert.equal(ids.length, 194);
  assert.deepEqual(Object.keys(about).sort(), [...ids].sort());
  for (const id of ids) assert.deepEqual(Object.keys(about[id]).sort(), ['about', 'fact'], id);
});

test('each description is 2 to 10 sentences, and each fact one short sentence', () => {
  for (const id of ids) {
    for (const k of ['about', 'fact']) {
      const t = about[id][k];
      assert.equal(typeof t, 'string', `${id} ${k}`);
      assert.match(t, /^[A-Z"'0-9]/, `${id} ${k} starts with a capital`);
      assert.match(t, /[.]$/, `${id} ${k} ends with a full stop`);
      assert.doesNotMatch(t, /\n|\s{2}/, `${id} ${k}: one line, single spaces`);
    }
    const { about: a, fact: f } = about[id];
    const n = sentences(a).length;
    assert.ok(n >= 2 && n <= 10, `${id} about: ${n} sentences`);
    assert.ok(a.length >= 120 && a.length <= 1400, `${id} about: ${a.length} characters`);
    assert.doesNotMatch(a, /\b(St|Mt|Dr|Mr|No|vs|etc|c)\.\s|\b[A-Z]\.\s/, `${id} about: an abbreviation would split a sentence`);
    assert.ok(f.length >= 30 && f.length <= 160, `${id} fact: ${f.length} characters`);
    assert.equal(sentences(f).length, 1, `${id} fact: one sentence`);
    assert.ok(!a.includes(f.slice(0, -1)), `${id}: the description repeats the fact`);
  }
});

test('a description shows as a lead sentence, then short paragraphs (src/scripts/paragraphs.ts)', () => {
  for (const id of ids) {
    const a = about[id].about, ps = paragraphs(a);
    assert.equal(ps.join(' '), a, `${id}: nothing lost or added`);
    assert.equal(sentences(ps[0]).length, 1, `${id}: the lead is one sentence`);
    for (const p of ps.slice(1)) assert.ok(sentences(p).length >= 1 && sentences(p).length <= 3, `${id}: ${sentences(p).length} sentences in a paragraph`);
  }
  assert.deepEqual(paragraphs('One here. Two here.'), ['One here. Two here.']);
  assert.deepEqual(paragraphs('A. B. C. D. E.').length, 3);
  assert.deepEqual(paragraphs(''), []);
});

test('the sheet data carries the texts as written (npm run build:sheets)', () => {
  for (const id of ids) {
    assert.equal(sheets.countries[id]?.a, about[id].about, `${id} about`);
    assert.equal(sheets.countries[id]?.f, about[id].fact, `${id} fact`);
  }
});

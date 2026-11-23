// Every country has a line about it and one fact on its sheet (James, 22 Nov 2026: "a short description and an
// interesting fact per country"), each one short sentence, and the built sheet data carries them as written.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { parseCsv } from '../scripts/lib/csv.mjs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const about = YAML.parse(read('data/countries/about.yaml'));
const ids = parseCsv(read('data/countries/countries.csv')).map(r => r.id);
const sheets = JSON.parse(read('public/data/sheets.json'));

test('every country has a line and a fact, and nothing else is there', () => {
  assert.equal(ids.length, 194);
  assert.deepEqual(Object.keys(about).sort(), [...ids].sort());
  for (const id of ids) assert.deepEqual(Object.keys(about[id]).sort(), ['about', 'fact'], id);
});

test('each is one short sentence', () => {
  for (const id of ids) {
    for (const [k, max] of [['about', 170], ['fact', 160]]) {
      const t = about[id][k];
      assert.equal(typeof t, 'string', `${id} ${k}`);
      assert.ok(t.length >= 30 && t.length <= max, `${id} ${k}: ${t.length} characters`);
      assert.match(t, /^[A-Z"'0-9]/, `${id} ${k} starts with a capital`);
      assert.match(t, /[.]$/, `${id} ${k} ends with a full stop`);
      assert.doesNotMatch(t, /\n|\s{2}|\.\s+[A-Z]/, `${id} ${k}: one sentence, one line`);
    }
  }
});

test('the sheet data carries the texts as written (npm run build:sheets)', () => {
  for (const id of ids) {
    assert.equal(sheets.countries[id]?.a, about[id].about, `${id} about`);
    assert.equal(sheets.countries[id]?.f, about[id].fact, `${id} fact`);
  }
});

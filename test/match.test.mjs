// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsv } from '../scripts/lib/csv.mjs';
import { resolve } from '../scripts/lib/match.mjs';

const countries = parseCsv(fs.readFileSync(new URL('../data/countries/countries.csv', import.meta.url), 'utf8'))
  .map(c => ({ ...c, aliases: c.aliases.split('|').filter(Boolean) }));
const r = s => resolve(s, countries)?.id ?? null;

test('exact names and aliases', () => {
  assert.equal(r('Belgium'), 'BEL');
  assert.equal(r('belgique'), 'BEL');
  assert.equal(r("Côte d'Ivoire"), 'CIV');
  assert.equal(r('cote divoire'), 'CIV');
  assert.equal(r('Czech Republic'), 'CZE');
  assert.equal(r('USA'), 'USA');
  assert.equal(r('the netherlands'), 'NLD');
});
test('small typos are silently corrected', () => {
  assert.equal(r('Usbekistan'), 'UZB');
  assert.equal(r('Australa'), 'AUS');
  assert.equal(r('Austrlia'), null);  // one typo from both Australia and Austria: too ambiguous
  assert.equal(r('Nambia'), 'NAM');   // one typo from Namibia, Gambia and Zambia: only Namibia starts with N
  assert.equal(r('Seria'), null);     // Serbia or Syria: same first letter, too ambiguous
  assert.equal(r('Kyrgyztan'), 'KGZ');
  assert.equal(r('Phillipines'), 'PHL');
});
test('confusable real names are never corrected into each other', () => {
  assert.equal(r('Niger'), 'NER');
  assert.equal(r('Nigeria'), 'NGA');
  assert.equal(r('Iran'), 'IRN');
  assert.equal(r('Iraq'), 'IRQ');
  assert.equal(r('Austria'), 'AUT');
  assert.equal(r('Slovakia'), 'SVK');
  assert.equal(r('Slovenia'), 'SVN');
});
test('short names get no typo tolerance, far-off answers are wrong', () => {
  assert.equal(r('Irak'), null);  // 4 letters: must be exact (or a listed alias)
  assert.equal(r('Germoney land'), null);
  assert.equal(r('Korea'), null);  // ambiguous, removed on purpose
});

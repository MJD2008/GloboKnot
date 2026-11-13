// Every country and capital is found however it is typed: lowercase, UPPERCASE, without accents. And the names
// people commonly use (old names, short forms) are accepted. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve } from '../scripts/lib/match.mjs';

const kb = JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

for (const [pool, list] of [['countries', kb.countries], ['capitals', kb.cities], ['languages', kb.languages]]) {
  test(`${pool}: any capitalisation or accents`, () => {
    const misses = [];
    for (const e of list) {
      for (const n of [e.name, ...(e.aliases ?? [])]) {
        for (const v of [n.toLowerCase(), n.toUpperCase(), strip(n).toLowerCase(), ` ${n} `]) {
          const hit = resolve(v, list);
          // Two entities may share a name (two cities called San José): then either one is fine.
          if (!hit || (hit.id !== e.id && hit.name !== e.name && !(hit.aliases ?? []).includes(n))) misses.push(`${v} → ${hit?.id ?? 'nothing'} (want ${e.id})`);
        }
      }
    }
    assert.deepEqual(misses, []);
  });
}

const COMMON = {
  'turkey': 'TUR', 'ivory coast': 'CIV', 'swaziland': 'SWZ', 'burma': 'MMR', 'east timor': 'TLS', 'timor leste': 'TLS',
  'cape verde': 'CPV', 'cabo verde': 'CPV', 'macedonia': 'MKD', 'north macedonia': 'MKD', 'czechia': 'CZE', 'czech republic': 'CZE',
  'vatican': 'VAT', 'vatican city': 'VAT', 'holy see': 'VAT', 'uk': 'GBR', 'great britain': 'GBR', 'united kingdom': 'GBR',
  'usa': 'USA', 'us': 'USA', 'america': 'USA', 'united states': 'USA', 'uae': 'ARE', 'emirates': 'ARE', 'drc': 'COD',
  'dr congo': 'COD', 'car': 'CAF', 'png': 'PNG', 'nz': 'NZL', 'south korea': 'KOR', 'north korea': 'PRK', 'russia': 'RUS',
  'laos': 'LAO', 'vietnam': 'VNM', 'viet nam': 'VNM', 'syria': 'SYR', 'iran': 'IRN', 'bolivia': 'BOL', 'venezuela': 'VEN',
  'tanzania': 'TZA', 'moldova': 'MDA', 'micronesia': 'FSM', 'brunei': 'BRN', 'bahamas': 'BHS', 'the bahamas': 'BHS',
  'gambia': 'GMB', 'the gambia': 'GMB', 'st kitts and nevis': 'KNA', 'saint kitts and nevis': 'KNA', 'st lucia': 'LCA',
  'st vincent and the grenadines': 'VCT', 'sao tome and principe': 'STP', 'bosnia': 'BIH', 'bosnia and herzegovina': 'BIH',
  'trinidad and tobago': 'TTO', 'antigua and barbuda': 'ATG', 'guinea bissau': 'GNB', 'eswatini': 'SWZ', 'myanmar': 'MMR',
  'ireland': 'IRL', 'eire': 'IRL', 'kyrgyzstan': 'KGZ', 'belarus': 'BLR', 'netherlands': 'NLD', 'the netherlands': 'NLD',
  'philippines': 'PHL', 'dominican republic': 'DOM', 'dominica': 'DMA', 'solomon islands': 'SLB', 'marshall islands': 'MHL',
  'saudi arabia': 'SAU', 'south africa': 'ZAF', 'south sudan': 'SSD', 'sudan': 'SDN', 'congo': 'COG', 'republic of the congo': 'COG',
  'democratic republic of the congo': 'COD', 'equatorial guinea': 'GNQ', 'papua new guinea': 'PNG', 'new zealand': 'NZL',
};
test('names people commonly use', () => {
  const misses = Object.entries(COMMON).map(([v, want]) => [v, resolve(v, kb.countries)?.id ?? null, want]).filter(([, got, want]) => got !== want);
  assert.deepEqual(misses, []);
});

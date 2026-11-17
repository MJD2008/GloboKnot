// Every country, capital, language, peak and river is found however it is typed: lowercase, UPPERCASE, without
// accents. And the names people commonly use (old names, short forms, names in their own language) are accepted
// (James, 16 Nov 2026: "alternative and former names should also be accepted ... Denali / Mount McKinley").
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve } from '../scripts/lib/match.mjs';

const kb = JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

for (const [pool, list] of [['countries', kb.countries], ['capitals', kb.cities], ['languages', kb.languages], ['peaks', kb.peaks], ['rivers', kb.rivers]]) {
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

const by = (list, typed) => Object.entries(typed).map(([v, want]) => [v, resolve(v, list)?.id ?? null, want]).filter(([, got, want]) => got !== want);

test('former names and names in their own language: countries', () => {
  assert.deepEqual(by(kb.countries, {
    'persia': 'IRN', 'ceylon': 'LKA', 'siam': 'THA', 'zaire': 'COD', 'dahomey': 'BEN', 'upper volta': 'BFA', 'rhodesia': 'ZWE',
    'northern rhodesia': 'ZMB', 'gold coast': 'GHA', 'kampuchea': 'KHM', 'new hebrides': 'VUT', 'nyasaland': 'MWI',
    'basutoland': 'LSO', 'bechuanaland': 'BWA', 'south west africa': 'NAM', 'british honduras': 'BLZ', 'british guiana': 'GUY',
    'dutch guiana': 'SUR', 'western samoa': 'WSM', 'byelorussia': 'BLR', 'moldavia': 'MDA', 'kirghizia': 'KGZ',
    'deutschland': 'DEU', 'espana': 'ESP', 'italia': 'ITA', 'osterreich': 'AUT', 'schweiz': 'CHE', 'suisse': 'CHE', 'sverige': 'SWE',
    'norge': 'NOR', 'suomi': 'FIN', 'polska': 'POL', 'hrvatska': 'HRV', 'hellas': 'GRC', 'brasil': 'BRA', 'bharat': 'IND',
  }), []);
});
test('former names and names in their own language: capitals', () => {
  assert.deepEqual(by(kb.cities, {
    'kiev': 'UKR.kyiv', 'peking': 'CHN.beijing', 'nur-sultan': 'KAZ.astana', 'akmola': 'KAZ.astana', 'salisbury': 'ZWE.harare',
    'leopoldville': 'COD.kinshasa', 'batavia': 'IDN.jakarta', 'christiania': 'NOR.oslo', 'frunze': 'KGZ.bishkek', 'dacca': 'BGD.dhaka',
    'tiflis': 'GEO.tbilisi', 'lourenco marques': 'MOZ.maputo', 'stalinabad': 'TJK.dushanbe', 'wien': 'AUT.vienna', 'praha': 'CZE.prague',
    'roma': 'ITA.rome', 'lisboa': 'PRT.lisbon', 'warszawa': 'POL.warsaw', 'moskva': 'RUS.moscow', 'kobenhavn': 'DNK.copenhagen',
    'bruxelles': 'BEL.brussels', 'la habana': 'CUB.havana', 'kotte': 'LKA.sri-jayewardenepura-kotte', 'ulan bator': 'MNG.ulan-bator',
  }), []);
});
test('peaks: other names, "Mount" left out, "Mt." for "Mount"', () => {
  assert.deepEqual(by(kb.peaks, {
    'mount mckinley': 'denali', 'mt. mckinley': 'denali', 'everest': 'mount-everest', 'mt everest': 'mount-everest',
    'sagarmatha': 'mount-everest', 'chomolungma': 'mount-everest', 'qomolangma': 'mount-everest', 'monte bianco': 'mont-blanc',
    'chhogori': 'k2', 'kangchenjunga': 'kanchenjunga', 'elbrus': 'mount-elbrus', 'kosciusko': 'mount-kosciuszko',
    'mount cook': 'aoraki-mount-cook', 'ararat': 'mount-ararat', 'kilimanjaro': 'mount-kilimanjaro', 'fujiyama': 'mount-fuji',
    'mt. fuji': 'mount-fuji', 'citlaltepetl': 'pico-de-orizaba', 'mount teide': 'teide',
  }), []);
  // Mount Kenya and Mount Cameroon keep "Mount": "Kenya" is the country.
  assert.equal(resolve('kenya', kb.peaks), null);
  assert.equal(resolve('cameroon', kb.peaks), null);
  // Names that were no names of the peak are gone.
  assert.equal(resolve('canary islands', kb.peaks), null);
  // Two peaks called Mount Olympus: Greece's (2,917 m) and Cyprus's (1,951 m).
  const olympus = kb.peaks.filter(p => p.name === 'Mount Olympus');
  assert.deepEqual(olympus.map(p => p.m).sort(), [1951, 2917]);
  assert.ok(olympus.every(p => p.aliases.includes('Olympus')));
});
test('rivers: other names, and "River" before or after', () => {
  assert.deepEqual(by(kb.rivers, {
    'yellow river': 'huang-he', 'the river nile': 'nile', 'nile river': 'nile', 'mississippi river': 'mississippi',
    'the amazon river': 'amazon', 'ganga': 'ganges', 'oxus': 'amu-darya', 'jaxartes': 'syr-darya', 'chang jiang': 'yangtze',
    'rio bravo': 'rio-grande', 'dnipro': 'dnieper', 'heilong jiang': 'amur', 'yarlung tsangpo': 'brahmaputra', 'jumna': 'yamuna',
    'karnali': 'ghaghara', 'st. lawrence river': 'saint-lawrence', 'zaire': 'congo',
  }), []);
});

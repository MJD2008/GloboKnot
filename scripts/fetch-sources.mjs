// Downloads the raw source datasets into sources/cache/ and records when.
// Run: node scripts/fetch-sources.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE = new URL('../sources/cache/', import.meta.url).pathname;
const RAW = 'https://raw.githubusercontent.com';
const FACTBOOK_REGIONS = ['africa', 'central-america-n-caribbean', 'central-asia', 'east-n-southeast-asia',
  'europe', 'middle-east', 'north-america', 'south-america', 'south-asia', 'australia-oceania'];

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (r.ok) return await r.text();
    } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 1000 * (i + 1)));
  }
  throw new Error('Failed: ' + url);
}

await fs.mkdir(path.join(CACHE, 'factbook'), { recursive: true });
const manifest = { fetched_on: new Date().toISOString().slice(0, 10), sources: {} };

const NE = `${RAW}/nvkelso/natural-earth-vector/master/geojson`;
const files = {
  'mledoze-countries.json': `${RAW}/mledoze/countries/master/countries.json`,
  'country-codes.csv': `${RAW}/datasets/country-codes/main/data/country-codes.csv`,
  // Natural Earth (public domain): capitals' positions, named peaks, rivers.
  'ne-populated-places.geojson': `${NE}/ne_10m_populated_places_simple.geojson`,
  'ne-elevation-points.geojson': `${NE}/ne_10m_geography_regions_elevation_points.geojson`,
  'ne-rivers.geojson': `${NE}/ne_10m_rivers_lake_centerlines.geojson`,
};
for (const [name, url] of Object.entries(files)) {
  await fs.writeFile(path.join(CACHE, name), await get(url));
  manifest.sources[name] = url;
  console.log('ok', name);
}

// The Universal Declaration of Human Rights in some 450 languages (OHCHR translations, "UDHR in Unicode"),
// as packaged in NLTK's udhr2 corpus: the language text samples.
const UDHR = `${RAW}/nltk/nltk_data/gh-pages/packages/corpora/udhr2.zip`;
const zip = await fetch(UDHR);
if (!zip.ok) throw new Error('Failed: ' + UDHR);
await fs.writeFile(path.join(CACHE, 'udhr2.zip'), Buffer.from(await zip.arrayBuffer()));
execFileSync('unzip', ['-oq', 'udhr2.zip', '-d', 'udhr2'], { cwd: CACHE });
manifest.sources.udhr2 = UDHR;
console.log('ok', 'udhr2');

// CIA World Factbook (factbook/factbook.json mirror), one file per country by FIPS/GEC code.
const csv = await fs.readFile(path.join(CACHE, 'country-codes.csv'), 'utf8');
const { parseCsv } = await import('./lib/csv.mjs');
const rows = parseCsv(csv);
const codes = [...new Set(rows.map(r => (r.FIPS || '').toLowerCase()).filter(Boolean))];
let found = 0;
for (const code of codes) {
  const out = path.join(CACHE, 'factbook', code + '.json');
  try { await fs.access(out); found++; continue; } catch {}
  for (const region of FACTBOOK_REGIONS) {
    const body = await get(`${RAW}/factbook/factbook.json/master/${region}/${code}.json`);
    if (body) { await fs.writeFile(out, body); found++; break; }
  }
}
manifest.sources.factbook = `${RAW}/factbook/factbook.json/master/<region>/<fips>.json (${found} files)`;
await fs.writeFile(path.join(CACHE, '..', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('factbook files:', found);

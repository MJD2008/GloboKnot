// Downloads the raw source datasets into sources/cache/ and records when.
// Run: node scripts/fetch-sources.mjs
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

const files = {
  'mledoze-countries.json': `${RAW}/mledoze/countries/master/countries.json`,
  'country-codes.csv': `${RAW}/datasets/country-codes/main/data/country-codes.csv`,
};
for (const [name, url] of Object.entries(files)) {
  await fs.writeFile(path.join(CACHE, name), await get(url));
  manifest.sources[name] = url;
  console.log('ok', name);
}

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

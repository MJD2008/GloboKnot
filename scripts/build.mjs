// Compiles the approved knowledge base into compact JSON for the website: build/data/countries.json.
// Only approved facts are included. Run check.mjs first (npm run data does both).
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { parseCsv } from './lib/csv.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => fs.readFile(root + p, 'utf8');
const relations = YAML.parse(await read('data/relations.yaml'));
const manifest = JSON.parse(await read('sources/manifest.json'));
const list = async p => parseCsv(await read(p)).map(e => ({ ...e, aliases: e.aliases ? e.aliases.split('|') : [] }));

const countries = await list('data/countries/countries.csv');
const cities = await list('data/countries/cities.csv');
const languages = await list('data/countries/languages.csv');
const facts = parseCsv(await read('data/countries/facts.csv')).filter(f => f.status === 'approved');

const out = {
  edition: manifest.fetched_on,
  sources: ['mledoze/countries (ODbL 1.0)', 'datasets/country-codes', 'CIA World Factbook (public domain)'],
  relations: Object.fromEntries(Object.entries(relations).map(([k, r]) =>
    [k, { from: r.from, to: r.to, many: r.many, symmetric: !!r.symmetric, complete: !!r.complete, map: r.map, forward: r.forward, reverse: r.reverse || null }])),
  countries: countries.map(c => ({ id: c.id, qid: c.wikidata, name: c.name, aliases: c.aliases, iso2: c.iso2,
    num: c.iso_numeric, flag: c.flag, ll: [+c.lat, +c.lng] })),
  cities: cities.filter(c => facts.some(f => f.object === c.id)).map(c => ({ id: c.id, name: c.name, aliases: c.aliases, country: c.country })),
  languages: languages.filter(l => facts.some(f => f.object === l.id)).map(l => ({ id: l.id, name: l.name, aliases: l.aliases })),
  // [subject, relation, object, qualifier?]
  facts: facts.map(f => f.qualifier ? [f.subject, f.relation, f.object, f.qualifier] : [f.subject, f.relation, f.object]),
  confusables: JSON.parse(await read('data/countries/confusables.json')),
};
await fs.mkdir(root + 'build/data', { recursive: true });
const json = JSON.stringify(out);
await fs.writeFile(root + 'build/data/countries.json', json);
console.log(`build/data/countries.json: ${out.countries.length} countries, ${out.facts.length} facts, ${(json.length / 1024).toFixed(0)} KB`);

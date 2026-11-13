// Compiles the approved knowledge base into compact JSON for the website: public/data/countries.json.
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
const peaks = await list('data/geo/peaks.csv');
const rivers = await list('data/geo/rivers.csv');
const samples = parseCsv(await read('data/languages/samples.csv'));
const clusters = parseCsv(await read('data/languages/clusters.csv'));
const allFacts = [...parseCsv(await read('data/countries/facts.csv')), ...parseCsv(await read('data/geo/facts.csv'))];
const facts = allFacts.filter(f => f.status === 'approved');
// A river crossing only one source names is still accepted as an answer (qualifier "also"), never shown as THE answer.
const also = allFacts.filter(f => f.status === 'draft' && f.relation === 'flows_through' && !f.subject.startsWith('?'));
const ll = e => (e.lat && e.lng ? [+(+e.lat).toFixed(3), +(+e.lng).toFixed(3)] : undefined);

const out = {
  edition: manifest.fetched_on,
  sources: ['mledoze/countries (ODbL 1.0)', 'datasets/country-codes', 'CIA World Factbook (public domain)',
    'Natural Earth (public domain)', 'Universal Declaration of Human Rights translations (OHCHR, via the UDHR in Unicode project)'],
  relations: Object.fromEntries(Object.entries(relations).map(([k, r]) =>
    [k, { from: r.from, to: r.to, many: r.many, symmetric: !!r.symmetric, complete: !!r.complete, map: r.map, forward: r.forward, reverse: r.reverse || null }])),
  countries: countries.map(c => ({ id: c.id, qid: c.wikidata, name: c.name, aliases: c.aliases, iso2: c.iso2,
    num: c.iso_numeric, flag: c.flag, ll: [+c.lat, +c.lng], tier: c.tier, ...(c.context ? { context: c.context.split('|') } : {}) })),
  cities: cities.filter(c => facts.some(f => f.object === c.id)).map(c => ({ id: c.id, name: c.name, aliases: c.aliases, country: c.country, ll: ll(c) })),
  languages: languages.filter(l => facts.some(f => f.object === l.id)).map(l => ({ id: l.id, name: l.name, aliases: l.aliases,
    sample: samples.find(s => s.id === l.id)?.text, cluster: clusters.find(c => c.members.split('|').includes(l.id))?.id })),
  peaks: peaks.filter(p => facts.some(f => f.object === p.id)).map(p => ({ id: p.id, name: p.name, aliases: p.aliases, m: +p.elevation, ll: ll(p) })),
  rivers: rivers.filter(r => facts.some(f => f.subject === r.id)).map(r => ({ id: r.id, name: r.name, aliases: r.aliases, km: +r.length_km })),
  // [subject, relation, object, qualifier?]
  facts: [...facts, ...also.map(f => ({ ...f, qualifier: 'also' }))].map(f => f.qualifier ? [f.subject, f.relation, f.object, f.qualifier] : [f.subject, f.relation, f.object]),
  confusables: JSON.parse(await read('data/countries/confusables.json')),
};
await fs.mkdir(root + 'public/data', { recursive: true });
const json = JSON.stringify(out);
await fs.writeFile(root + 'public/data/countries.json', json);
console.log(`public/data/countries.json: ${out.countries.length} countries, ${out.peaks.length} peaks, ${out.rivers.length} rivers, ${out.languages.filter(l => l.sample).length} language texts, ${out.facts.length} facts, ${(json.length / 1024).toFixed(0)} KB`);

// Validates the knowledge base. Exits with code 1 on any error, so a bad fact can never ship.
// Run: node scripts/check.mjs
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { parseCsv } from './lib/csv.mjs';
import { norm } from './lib/text.mjs';
import { distance } from './lib/match.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => fs.readFile(root + p, 'utf8');
const relations = YAML.parse(await read('data/relations.yaml'));
const disputed = JSON.parse(await read('data/disputed.json'));
const countries = parseCsv(await read('data/countries/countries.csv'));
const cities = parseCsv(await read('data/countries/cities.csv'));
const languages = parseCsv(await read('data/countries/languages.csv'));
const facts = parseCsv(await read('data/countries/facts.csv'));
const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];

const errors = [], warnings = [];
const typeOf = new Map();
for (const [type, list] of [['country', countries], ['city', cities], ['language', languages]]) {
  for (const e of list) {
    if (typeOf.has(e.id)) errors.push(`duplicate id ${e.id}`);
    typeOf.set(e.id, type);
    if (!e.name) errors.push(`${e.id} has no name`);
  }
}
for (const c of CONTINENTS) typeOf.set(c, 'continent');

// Facts: known relation, right entity types, sources and a check stamp on everything approved.
const approved = facts.filter(f => f.status === 'approved');
for (const f of approved) {
  const rel = relations[f.relation];
  const where = `${f.subject} ${f.relation} ${f.object}`;
  if (!rel) { errors.push(`unknown relation: ${where}`); continue; }
  if (typeOf.get(f.subject) !== rel.from) errors.push(`subject should be a ${rel.from}: ${where}`);
  if (typeOf.get(f.object) !== rel.to) errors.push(`object should be a ${rel.to}: ${where}`);
  if (!f.sources) errors.push(`no source: ${where}`);
  if (!f.checked) errors.push(`not checked: ${where}`);
  if (disputed.entities.some(d => d.id === f.subject || d.id === f.object)) errors.push(`disputed entity in approved fact: ${where}`);
  if (rel.symmetric && f.subject > f.object) errors.push(`symmetric fact not stored alphabetically: ${where}`);
  if (f.subject === f.object) errors.push(`self-reference: ${where}`);
}
const dup = new Set();
for (const f of approved) {
  const k = `${f.subject}|${f.relation}|${f.object}`;
  if (dup.has(k)) errors.push(`duplicate fact ${k}`); dup.add(k);
}
for (const [name, rel] of Object.entries(relations)) {
  if (rel.many === false) {
    const per = {};
    for (const f of approved.filter(f => f.relation === name)) per[f.subject] = (per[f.subject] || 0) + 1;
    for (const [s, n] of Object.entries(per)) if (n > 1) errors.push(`${s} has ${n} ${name} facts but the relation allows one`);
  }
}
for (const c of countries) {
  if (!approved.some(f => f.subject === c.id && f.relation === 'continent')) errors.push(`${c.id} has no continent`);
  if (!approved.some(f => f.subject === c.id && f.relation === 'official_language')) warnings.push(`${c.id} (${c.name}) has no official language`);
  if (!approved.some(f => f.subject === c.id && f.relation === 'capital')) warnings.push(`${c.id} (${c.name}) has no capital (excluded or pending)`);
}

// Answers: no accepted name may point to two entities of the same type.
for (const [type, list] of [['country', countries], ['city', cities], ['language', languages]]) {
  const seen = new Map();
  for (const e of list) for (const n of [e.name, ...e.aliases.split('|')].filter(Boolean)) {
    const k = norm(n);
    if (seen.has(k) && seen.get(k) !== e.id) errors.push(`ambiguous ${type} answer "${n}": ${seen.get(k)} and ${e.id}`);
    seen.set(k, e.id);
  }
}

// Confusable names (Niger/Nigeria): these never get typo-tolerance against each other. Written for the matcher.
const confusables = [];
for (const [type, list] of [['country', countries], ['city', cities]]) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = norm(list[i].name), b = norm(list[j].name);
    if (Math.abs(a.length - b.length) <= 2 && distance(a, b) <= 2) confusables.push([list[i].id, list[j].id]);
  }
}
await fs.writeFile(root + 'data/countries/confusables.json', JSON.stringify(confusables) + '\n');

for (const w of warnings) console.log('warn ', w);
for (const e of errors) console.log('ERROR', e);
console.log(`\n${approved.length} approved facts, ${errors.length} errors, ${warnings.length} warnings, ${confusables.length} confusable pairs`);
if (errors.length) process.exit(1);

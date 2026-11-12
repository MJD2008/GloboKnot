// Imports the countries module from the cached sources (run fetch-sources.mjs first).
//
// Every fact gets a status:
//   approved  - two independent sources agree, or a human decision in decisions.csv approves it
//   draft     - sources disagree or only one source has it: goes to review/countries.md
//   rejected  - a human decision rejected it (kept so re-imports don't bring it back)
//
// Human decisions live in data/countries/decisions.csv and always win over the sources.
// Run: node scripts/import-countries.mjs
import fs from 'node:fs/promises';
import { parseCsv, toCsv } from './lib/csv.mjs';
import { norm, slug, decodeHtml } from './lib/text.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => fs.readFile(root + p, 'utf8');
const manifest = JSON.parse(await read('sources/manifest.json'));
const TODAY = manifest.fetched_on;

const mledoze = JSON.parse(await read('sources/cache/mledoze-countries.json'));
const codes = Object.fromEntries(parseCsv(await read('sources/cache/country-codes.csv'))
  .filter(r => r['ISO3166-1-Alpha-3']).map(r => [r['ISO3166-1-Alpha-3'], r]));
const factbook = {};
for (const c of Object.values(codes)) {
  const fips = (c.FIPS || '').toLowerCase();
  if (!fips) continue;
  try { factbook[c['ISO3166-1-Alpha-3']] = JSON.parse(await read(`sources/cache/factbook/${fips}.json`)); } catch {}
}
const nePlaces = JSON.parse(await read('sources/cache/ne-populated-places.geojson')).features.map(f => f.properties);
const decisions = parseCsv(await read('data/countries/decisions.csv').catch(() => 'subject,relation,object,decision,qualifier,note,by,date\n'));
const decisionOf = (s, r, o) => decisions.find(d => d.relation === r && ((d.subject === s && d.object === o) || (r === 'borders' && d.subject === o && d.object === s)));
const disputed = JSON.parse(await read('data/disputed.json'));

// ---------- Scope: UN member states + Holy See (194). Palestine, Kosovo, Taiwan etc. are in disputed.json.
const scope = mledoze.filter(c => c.unMember || c.cca3 === 'VAT');
const inScope = new Set(scope.map(c => c.cca3));

// ---------- Name index, used to match the Factbook's country and language names to ids.
const countryByName = new Map();
const addName = (name, id) => { const k = norm(name); if (k && !countryByName.has(k)) countryByName.set(k, id); };
for (const c of mledoze) {
  addName(c.name.common, c.cca3); addName(c.name.official, c.cca3);
  for (const a of c.altSpellings || []) addName(a, c.cca3);
}
for (const [id, fb] of Object.entries(factbook)) {
  const n = fb.Government?.['Country name'] || {};
  for (const k of ['conventional short form', 'conventional long form']) {
    const t = decodeHtml(n[k]?.text || '');
    if (t && t !== 'none') addName(t, id);
  }
}
const EXTRA_COUNTRY_NAMES = { 'burma': 'MMR', 'gaza strip': 'PSE', 'west bank': 'PSE', 'holy see vatican city': 'VAT',
  'holy see': 'VAT', 'congo republic of the': 'COG', 'congo democratic republic of the': 'COD', 'czechia': 'CZE',
  'korea north': 'PRK', 'korea south': 'KOR', 'gambia the': 'GMB', 'bahamas the': 'BHS', 'timor leste': 'TLS',
  'micronesia federated states of': 'FSM', 'eswatini': 'SWZ', 'turkey turkiye': 'TUR', 'turkiye': 'TUR',
  'cabo verde': 'CPV', 'cote divoire': 'CIV', 'north macedonia': 'MKD', 'western sahara': 'ESH', 'kosovo': 'UNK',
  'french guiana': 'GUF', 'saint martin': 'MAF', 'sint maarten': 'SXM', 'gibraltar': 'GIB', 'akrotiri': 'XAK', 'dhekelia': 'XDK' };
for (const [k, v] of Object.entries(EXTRA_COUNTRY_NAMES)) countryByName.set(norm(k), v);
const countryId = name => countryByName.get(norm(name));

// Languages: ISO 639-3 ids, names from mledoze plus a few Factbook spellings.
const langName = {};
for (const c of mledoze) for (const [k, v] of Object.entries(c.languages || {})) langName[k] ??= v;
const langByName = new Map(Object.entries(langName).map(([k, v]) => [norm(v), k]));
const EXTRA_LANG_NAMES = {
  'standard chinese': 'zho', 'mandarin': 'zho', 'chinese': 'zho', 'putonghua': 'zho', 'farsi': 'pes', 'persian': 'pes',
  'filipino': 'fil', 'tagalog': 'fil', 'kiswahili': 'swa', 'swahili': 'swa', 'bahasa indonesia': 'ind', 'indonesian': 'ind',
  'malay': 'msa', 'bahasa malaysia': 'msa', 'isizulu': 'zul', 'zulu': 'zul', 'isixhosa': 'xho', 'xhosa': 'xho',
  'sepedi': 'nso', 'pedi': 'nso', 'setswana': 'tsn', 'tswana': 'tsn', 'sesotho': 'sot', 'sotho': 'sot', 'xitsonga': 'tso',
  'tsonga': 'tso', 'siswati': 'ssw', 'swati': 'ssw', 'tshivenda': 'ven', 'venda': 'ven', 'isindebele': 'nbl',
  'ndebele': 'nde', 'kirundi': 'run', 'kinyarwanda': 'kin', 'dhivehi': 'div', 'maldivian': 'div', 'tetum': 'tet',
  'tetun': 'tet', 'pashto': 'pus', 'dari': 'prs', 'uzbek': 'uzb', 'turkmen': 'tuk', 'tajik': 'tgk', 'kyrgyz': 'kir',
  'kazakh': 'kaz', 'irish': 'gle', 'gaelic': 'gle', 'irish gaelic': 'gle', 'luxembourgish': 'ltz', 'letzebuergesch': 'ltz',
  'maltese': 'mlt', 'greenlandic': 'kal', 'sango': 'sag', 'tigrinya': 'tir', 'amharic': 'amh', 'somali': 'som',
  'chichewa': 'nya', 'chewa': 'nya', 'samoan': 'smo', 'tongan': 'ton', 'fijian': 'fij', 'hindustani': 'hif',
  'bislama': 'bis', 'tok pisin': 'tpi', 'hiri motu': 'hmo', 'marshallese': 'mah', 'palauan': 'pau', 'nauruan': 'nau',
  'gilbertese': 'gil', 'i kiribati': 'gil', 'tuvaluan': 'tvl', 'dzongkha': 'dzo', 'sinhala': 'sin', 'tamil': 'tam',
  'nepali': 'nep', 'bengali': 'ben', 'bangla': 'ben', 'urdu': 'urd', 'hindi': 'hin', 'english': 'eng', 'french': 'fra',
  'spanish': 'spa', 'castilian': 'spa', 'portuguese': 'por', 'arabic': 'ara', 'russian': 'rus', 'german': 'deu',
  'swiss german': 'deu', 'italian': 'ita', 'dutch': 'nld', 'romansh': 'roh', 'catalan': 'cat', 'quechua': 'que',
  'aymara': 'aym', 'guarani': 'grn', 'haitian creole': 'hat', 'creole': 'hat', 'papiamento': 'pap', 'mauritian creole': 'mfe',
  'seychellois creole': 'crs', 'kreol': 'crs', 'shona': 'sna', 'malagasy': 'mlg', 'comorian': 'zdj', 'kurdish': 'kur',
  'hebrew': 'heb', 'turkish': 'tur', 'greek': 'ell', 'albanian': 'sqi', 'macedonian': 'mkd', 'serbian': 'srp',
  'croatian': 'hrv', 'bosnian': 'bos', 'montenegrin': 'cnr', 'slovene': 'slv', 'slovenian': 'slv', 'slovak': 'slk',
  'czech': 'ces', 'polish': 'pol', 'hungarian': 'hun', 'romanian': 'ron', 'moldovan': 'ron', 'bulgarian': 'bul',
  'ukrainian': 'ukr', 'belarusian': 'bel', 'lithuanian': 'lit', 'latvian': 'lav', 'estonian': 'est', 'finnish': 'fin',
  'swedish': 'swe', 'norwegian': 'nor', 'danish': 'dan', 'icelandic': 'isl', 'georgian': 'kat', 'armenian': 'hye',
  'azerbaijani': 'aze', 'azeri': 'aze', 'mongolian': 'mon', 'khalkha mongol': 'mon', 'korean': 'kor', 'japanese': 'jpn',
  'vietnamese': 'vie', 'thai': 'tha', 'lao': 'lao', 'khmer': 'khm', 'burmese': 'mya', 'malaysian': 'msa',
  'lingala': 'lin', 'kikongo': 'kon', 'tshiluba': 'lua', 'afrikaans': 'afr', 'sesotho sa leboa': 'nso',
  'english only': 'eng', 'castilian spanish': 'spa', 'french creole': 'hat', 'creole french': 'hat', 'samoan polynesian': 'smo',
  'fula': 'ful', 'fulani': 'ful', 'wolof': 'wol', 'kituba': 'mkw', 'ndau': 'ndc', 'tonga': 'toi', 'barwe': 'bwg', 'chibarwe': 'bwg',
  'kalanga': 'kck', 'koisan': 'khi', 'nambya': 'nmq', 'sign language': 'sgn', 'shangani': 'sna', 'tswana language': 'tsn',
};
for (const [k, v] of Object.entries(EXTRA_LANG_NAMES)) langByName.set(norm(k), v);
const langId = name => langByName.get(norm(name));

// ---------- Continents (filter use; transcontinental countries carry a qualifier).
function continentFromM49(c) {
  const region = c['Region Name'], sub = c['Sub-region Name'], inter = c['Intermediate Region Name'];
  if (region === 'Americas') return inter === 'South America' ? 'South America' : 'North America';
  return region; // Africa, Asia, Europe, Oceania
}
function continentFromMledoze(c) {
  if (c.region === 'Americas') return c.subregion === 'South America' ? 'South America' : 'North America';
  return c.region;
}
const TRANSCONTINENTAL = { RUS: 'Europe and Asia', TUR: 'Asia and Europe', KAZ: 'Asia and Europe', AZE: 'Asia and Europe',
  GEO: 'Asia and Europe', EGY: 'Africa and Asia', PAN: 'North and South America' };

// ---------- Factbook parsers
function fbCapitals(fb) {
  const t = decodeHtml(fb?.Government?.Capital?.name?.text || '');
  if (!t) return [];
  // "Pretoria (administrative capital); Cape Town (legislative capital)"  or  "Amsterdam; note - The Hague is the seat of government"
  return t.split(/;/).map(s => s.trim()).filter(s => s && !/^note\b/i.test(s))
    .map(s => ({ name: s.replace(/\s*\(.*?\)\s*/g, '').trim(), note: (s.match(/\((.*?)\)/) || [])[1] || '' }));
}
function fbBorders(fb) {
  const lb = fb?.Geography?.['Land boundaries'] || {};
  const out = [];
  for (const [k, v] of Object.entries(lb)) {
    if (!/^border countries/i.test(k)) continue;
    if (/french guiana|overseas|guadeloupe|martinique|saint martin/i.test(k)) continue; // overseas parts: excluded by definition
    for (const part of decodeHtml(v.text).split(/;/)) {
      const name = part.replace(/\(.*?\)/g, '').replace(/[\d.,]+\s*km.*$/i, '').trim();
      if (name) out.push(name);
    }
  }
  return out;
}
function fbOfficialLanguages(fb) {
  const L = fb?.['People and Society']?.Languages || {};
  const full = decodeHtml([L.Languages?.text ?? L.text ?? '', L.note || '', L.Languages?.note || ''].join(' ; '));
  const [main, ...notes] = full.split(/;\s*note\b|\bnote\s*[-:]/i);
  const found = [];
  const add = raw => {
    raw = raw.replace(/\(.*?\)/g, '').replace(/^(and|or|the)\s+/i, '').replace(/\bonly\b/i, '').replace(/[\d.,]+%/g, '').trim();
    if (!raw || found.some(f => f.raw === raw)) return;
    const candidates = [raw, ...raw.split(/\s+or\s+|\s*\/\s*/)].map(s => s.trim()).filter(Boolean);
    found.push({ raw, id: candidates.map(langId).find(Boolean) });
  };
  // "Dutch (official)", "Portuguese 71.2% (official)", "Spanish (Castilian; official)" - but not "(official in X province)"
  const re = /([A-Za-z][A-Za-z' \-]*?(?:\s*\([^()]*\))?)\s*(?:[\d.,]+%\s*)?\(([^()]*\bofficial\b[^()]*)\)/gi;
  let m;
  while ((m = re.exec(main))) {
    if (/\bofficial\s+(in|at)\b|regional|recogni[sz]ed|provincial|\bstate\b|co-official in/i.test(m[2])) continue;
    add(m[1]);
  }
  // Notes: "English is the official language", "Hindi ... English is the subsidiary official language", "official languages are X and Y"
  for (const t of [main, ...notes]) {
    for (const n of t.matchAll(/([A-Z][A-Za-z]+(?:,? (?:and )?[A-Z][A-Za-z]+)*) (?:is|are) (?:the |an |also )?(?:\w+ )?(?:national )?official (?:national )?languages?(?! in| at)/g))
      n[1].split(/,\s*|\s+and\s+/).forEach(add);
    for (const n of t.matchAll(/official (?:national )?languages? (?:is|are) ([A-Z][A-Za-z]+(?:,? (?:and )?[A-Z][A-Za-z]+)*)/g))
      n[1].split(/,\s*|\s+and\s+/).forEach(add);
  }
  return found;
}

// Languages people speak, official or not (answers only): from the Factbook's shares of speakers. A language spoken by
// 5% or more counts, or one of the first three listed where the Factbook gives no shares.
function fbSpokenLanguages(fb) {
  const L = fb?.['People and Society']?.Languages || {};
  const main = decodeHtml(L.Languages?.text ?? L.text ?? '').split(/;\s*note\b|\bnote\s*[-:]/i)[0];
  const items = [];
  let depth = 0, cur = '';
  for (const ch of main) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if ((ch === ',' || ch === ';') && depth === 0) { items.push(cur); cur = ''; } else cur += ch;
  }
  items.push(cur);
  const shares = /%/.test(main), out = [];
  items.forEach((raw, i) => {
    const pct = +(raw.match(/([\d.]+)%/) || [])[1] || 0;
    const name = raw.replace(/\(.*?\)/g, '').replace(/[\d.]+%/g, '').replace(/\b(only|languages?|dialects?|est\.?)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!name || /^(other|unspecified|none|and)\b/i.test(name) || /^(french )?creole$/i.test(name) || !(shares ? pct >= 5 : i < 3)) return; // "Creole" alone could be any creole
    const id = [name, ...name.split(/\s+or\s+|\s*\/\s*/)].map(langId).find(Boolean);
    if (id) out.push({ id, pct, raw: name });
  });
  return out;
}

const CITY_SAME = [['ulan bator', 'ulaanbaatar'], ['naypyidaw', 'nay pyi taw'], ['city of san marino', 'san marino'],
  ['south tarawa', 'tarawa'], ['washington dc', 'washington d c'], ['washington', 'washington d c']];
const sameCity = (a, b) => {
  const x = norm(a).replace(/\s+/g, ''), y = norm(b).replace(/\s+/g, '');
  return x === y || CITY_SAME.some(([p, q]) => [p, q].map(z => z.replace(/\s+/g, '')).includes(x) && [p, q].map(z => z.replace(/\s+/g, '')).includes(y));
};

// ---------- Build entities and facts
const countries = [], cities = [], langsUsed = new Map(), facts = [];
const cityIds = new Map();
function fact(subject, relation, object, sources, agree, extra = {}) {
  const d = decisionOf(subject, relation, object);
  let status = agree ? 'approved' : 'draft';
  let qualifier = extra.qualifier || '', note = extra.note || '', checked = agree ? `auto:${TODAY}` : '';
  if (d) {
    status = d.decision; checked = `${d.by}:${d.date}`;
    if (d.qualifier) qualifier = d.qualifier;
    if (d.note) note = d.note;
  }
  facts.push({ subject, relation, object, qualifier, sources: sources.join('+'), status, checked, note, evidence: extra.evidence || '' });
}

for (const c of scope) {
  const id = c.cca3, cc = codes[id] || {}, fb = factbook[id];
  const aliases = new Set([c.name.official, cc['UNTERM English Short'], cc['CLDR display name'],
    decodeHtml(fb?.Government?.['Country name']?.['conventional short form']?.text || ''),
    ...(c.altSpellings || [])]
    .filter(a => a && a !== 'none' && a !== c.name.common && !/^[A-Z]{2,3}$/.test(a) && /^[\p{Script=Latin}\s'’().,\-]+$/u.test(a))
    .map(a => a.replace(/\s*\(the\)$/i, '').replace(/^the\s+/i, '').trim()));
  aliases.delete(c.name.common);
  countries.push({
    id, wikidata: cc.wikidata_id || '', name: c.name.common, aliases: [...aliases].join('|'),
    iso2: c.cca2, iso_numeric: c.ccn3, flag: c.cca2.toLowerCase(), lat: c.latlng[0].toFixed(2), lng: c.latlng[1].toFixed(2),
    un_member: c.unMember ? 'yes' : 'observer', tier: '',
  });

  // continent
  const a = continentFromMledoze(c), b = continentFromM49(cc);
  fact(id, 'continent', a, ['mledoze', 'm49'], a === b && !TRANSCONTINENTAL[id],
    { qualifier: TRANSCONTINENTAL[id] ? `transcontinental: ${TRANSCONTINENTAL[id]}` : '', evidence: `mledoze=${a}; m49=${b}` });

  // capital(s)
  const fbc = fbCapitals(fb);
  const ccCap = cc.Capital || '';
  for (const name of c.capital || []) {
    const cid = `${id}.${slug(name)}`;
    if (!cityIds.has(cid)) { cityIds.set(cid, true); cities.push({ id: cid, name, aliases: '', country: id }); }
    const inFb = fbc.find(x => sameCity(x.name, name));
    const inCc = ccCap && sameCity(ccCap, name);
    const multi = (c.capital.length > 1) || fbc.length > 1;
    fact(id, 'capital', cid, ['mledoze', inFb && 'factbook', inCc && 'country-codes'].filter(Boolean),
      !multi && (inFb || inCc), { qualifier: inFb?.note || '', evidence: `factbook=${fbc.map(x => x.name + (x.note ? ` (${x.note})` : '')).join(' / ') || '-'}; country-codes=${ccCap || '-'}` });
  }
  for (const x of fbc) { // capitals only the Factbook names
    if ((c.capital || []).some(n => sameCity(x.name, n))) continue;
    if (x.name.split(' ').length > 5) continue; // a sentence, not a city name
    const cid = `${id}.${slug(x.name)}`;
    if (!cityIds.has(cid)) { cityIds.set(cid, true); cities.push({ id: cid, name: x.name, aliases: '', country: id }); }
    fact(id, 'capital', cid, ['factbook'], false, { qualifier: x.note, evidence: `mledoze=${(c.capital || []).join(' / ')}` });
  }

  // official languages
  const fbl = fbOfficialLanguages(fb);
  const mlz = Object.keys(c.languages || {});
  for (const l of mlz) {
    langsUsed.set(l, langName[l]);
    const agree = fbl.some(x => x.id === l);
    fact(id, 'official_language', l, ['mledoze', agree && 'factbook'].filter(Boolean), agree,
      { evidence: `factbook official=${fbl.map(x => x.raw).join(', ') || '-'}` });
  }
  // spoken languages that are not official (answers only, one source is enough: it can only make answers count)
  for (const x of fbSpokenLanguages(fb)) {
    if (mlz.includes(x.id) || fbl.some(o => o.id === x.id) || facts.some(f => f.subject === id && f.relation === 'spoken_language' && f.object === x.id)) continue;
    langsUsed.set(x.id, langName[x.id] || x.raw);
    fact(id, 'spoken_language', x.id, ['factbook'], true, { qualifier: x.pct ? `${x.pct}%` : '', evidence: x.raw });
  }
  for (const x of fbl) {
    if (!x.id) { fact(id, 'official_language', `?${x.raw}`, ['factbook'], false, { note: 'unmapped language name' }); continue; }
    if (mlz.includes(x.id)) continue;
    langsUsed.set(x.id, langName[x.id] || x.raw);
    fact(id, 'official_language', x.id, ['factbook'], false, { evidence: `mledoze=${mlz.map(l => langName[l]).join(', ')}` });
  }
}

// Approved human decisions for facts no source proposed (e.g. Tamazight in Algeria) are added as manual facts.
for (const d of decisions) {
  if (d.decision !== 'approved' || facts.some(f => f.subject === d.subject && f.relation === d.relation && f.object === d.object)) continue;
  if (d.relation === 'borders') continue; // handled below
  if (d.relation === 'official_language') langsUsed.set(d.object, d.object_name || langName[d.object] || d.object);
  facts.push({ subject: d.subject, relation: d.relation, object: d.object, qualifier: d.qualifier, sources: 'manual',
    status: 'approved', checked: `${d.by}:${d.date}`, note: d.note, evidence: '' });
}

// borders (land, main territory; symmetric; stored once per pair, alphabetical)
const pairs = new Map();
for (const c of scope) {
  for (const b of c.borders || []) {
    const key = [c.cca3, b].sort().join('~');
    (pairs.get(key) || pairs.set(key, new Set()).get(key)).add('mledoze');
  }
  for (const name of fbBorders(factbook[c.cca3])) {
    const b = countryId(name);
    const key = [c.cca3, b || `?${name}`].sort().join('~');
    (pairs.get(key) || pairs.set(key, new Set()).get(key)).add('factbook');
  }
}
for (const [key, srcs] of pairs) {
  const [x, y] = key.split('~');
  const isDisputed = disputed.entities.some(d => d.id === x || d.id === y);
  if (!inScope.has(x) || !inScope.has(y)) {
    // borders with dependencies, disputed or unknown places: recorded as rejected-by-definition so they never ship
    facts.push({ subject: x, relation: 'borders', object: y, qualifier: '', sources: [...srcs].join('+'), status: 'excluded',
      checked: `rule:${TODAY}`, note: isDisputed ? 'involves a disputed entity' : 'not a country in scope (dependency/territory)', evidence: '' });
    continue;
  }
  fact(x, 'borders', y, [...srcs], srcs.size === 2);
}

// ---------- Manual name overrides (names.csv): preferred display name, extra accepted answers, removed ambiguous ones.
const names = parseCsv(await read('data/countries/names.csv'));
for (const n of names) {
  const ent = countries.find(e => e.id === n.id) || cities.find(e => e.id === n.id);
  let target = ent;
  if (!target && langsUsed.has(n.id)) { langsUsed.set(n.id, n.name || langsUsed.get(n.id)); target = null; }
  if (!target) continue;
  const al = new Set((target.aliases || '').split('|').filter(Boolean));
  if (n.name && n.name !== target.name) { al.add(target.name); target.name = n.name; }
  n.add_aliases.split('|').filter(Boolean).forEach(a => al.add(a));
  n.remove_aliases.split('|').filter(Boolean).forEach(a => al.delete(a));
  al.delete(target.name);
  target.aliases = [...al].join('|');
}

// ---------- Capital positions (for the dot on the map): the Factbook's coordinates and Natural Earth's populated
// places must agree within 50 km. Then Natural Earth's (more precise) position is used; otherwise there is no dot.
function fbCoords(fb) {
  const t = decodeHtml(fb?.Government?.Capital?.['geographic coordinates']?.text || '');
  const m = t.match(/(\d+)\s+(\d+)\s*([NS]),\s*(\d+)\s+(\d+)\s*([EW])/);
  if (!m || +m[2] > 59 || +m[5] > 59) return null; // e.g. Belgium's "50 84 N" is not a valid position
  const lat = (+m[1] + m[2] / 60) * (m[3] === 'S' ? -1 : 1), lng = (+m[4] + m[5] / 60) * (m[6] === 'W' ? -1 : 1);
  return [lat, lng];
}
function km([a, b], [c, d]) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
const positionDecisions = parseCsv(await read('data/countries/positions.csv'));
const coordReview = [];
for (const city of cities) {
  // The Factbook gives one position: its first capital's ("Gitega (political capital), Bujumbura (...)" -> Gitega).
  const fbFirst = decodeHtml(factbook[city.country]?.Government?.Capital?.name?.text || '').split(/[(;,]/)[0].trim();
  const fb = fbFirst && sameCity(fbFirst, city.name) ? fbCoords(factbook[city.country]) : null;
  const names = [city.name, ...(city.aliases || '').split('|')].filter(Boolean);
  const candidates = nePlaces.filter(p => p.adm0_a3 === city.country || p.sov_a3 === city.country)
    .filter(p => names.some(n => sameCity(n, p.name) || sameCity(n, p.nameascii) || (p.namealt || '').split('|').some(a => sameCity(n, a))));
  const ne = candidates.sort((x, y) => (y.adm0cap - x.adm0cap) || (x.scalerank - y.scalerank))[0];
  const nePos = ne ? [ne.latitude, ne.longitude] : null;
  city.lat = city.lng = ''; city.position = '';
  const decided = positionDecisions.find(d => d.id === city.id);
  if (decided) {
    city.lat = (+decided.lat).toFixed(3); city.lng = (+decided.lng).toFixed(3); city.position = `${decided.by}:${decided.date}`;
  } else if (fb && nePos && km(fb, nePos) <= 50) {
    city.lat = nePos[0].toFixed(3); city.lng = nePos[1].toFixed(3); city.position = 'factbook+naturalearth';
  } else {
    coordReview.push({ city, fb, ne: nePos, d: fb && nePos ? km(fb, nePos) : null });
  }
}

// ---------- Difficulty tiers (tiers.csv): a play-balance setting, not a fact. 'core' = widely known; the rest 'other'.
const tiers = Object.fromEntries(parseCsv(await read('data/countries/tiers.csv')).map(t => [t.id, t.tier]));
for (const c of countries) c.tier = tiers[c.id] || 'other';

// ---------- Write files
const langs = [...langsUsed].filter(([k]) => k && !k.startsWith('?')).sort()
  .map(([id, name]) => {
    const n = names.find(x => x.id === id);
    const al = new Set((n?.add_aliases || '').split('|').filter(Boolean));
    if (langName[id] && langName[id] !== name) al.add(langName[id]);
    al.delete(name);
    return { id, name, aliases: [...al].join('|') };
  });
await fs.mkdir(root + 'data/countries', { recursive: true });
const order = { approved: 0, draft: 1, rejected: 2, excluded: 3 };
facts.sort((p, q) => p.relation.localeCompare(q.relation) || p.subject.localeCompare(q.subject) || p.object.localeCompare(q.object));
await fs.writeFile(root + 'data/countries/countries.csv', toCsv(countries, ['id', 'wikidata', 'name', 'aliases', 'iso2', 'iso_numeric', 'flag', 'lat', 'lng', 'un_member', 'tier']));
await fs.writeFile(root + 'data/countries/cities.csv', toCsv(cities.sort((a, b) => a.id.localeCompare(b.id)), ['id', 'name', 'aliases', 'country', 'lat', 'lng', 'position']));
await fs.writeFile(root + 'data/countries/languages.csv', toCsv(langs, ['id', 'name', 'aliases']));
await fs.writeFile(root + 'data/countries/facts.csv', toCsv(facts, ['subject', 'relation', 'object', 'qualifier', 'sources', 'status', 'checked', 'note']));

// Review queue: every draft with what each source said.
const nameOf = id => countries.find(c => c.id === id)?.name || cities.find(c => c.id === id)?.name || langName[id] || id;
const drafts = facts.filter(f => f.status === 'draft');
let md = `# Review queue: countries\n\nGenerated ${TODAY}. ${drafts.length} facts need a decision. ` +
  `Record each one in data/countries/decisions.csv (approved / rejected, optional qualifier and note), then re-run the import.\n`;
for (const rel of [...new Set(drafts.map(f => f.relation))]) {
  md += `\n## ${rel}\n\n| Subject | Object | Sources | Evidence |\n|---|---|---|---|\n`;
  for (const f of drafts.filter(f => f.relation === rel))
    md += `| ${nameOf(f.subject)} (${f.subject}) | ${nameOf(f.object)} (${f.object}) | ${f.sources} | ${f.evidence.replace(/\|/g, '/')} |\n`;
}
const capitalIds = new Set(facts.filter(f => f.relation === 'capital' && f.status === 'approved').map(f => f.object));
const missing = coordReview.filter(r => capitalIds.has(r.city.id));
if (missing.length) {
  md += `\n## Capital positions without a dot\n\nThe two sources must agree within 50 km. ${missing.length === 1 ? "This capital gets" : `These ${missing.length} capitals get`} no dot on the map until they do.\n\n| Capital | Factbook | Natural Earth | Apart |\n|---|---|---|---|\n`;
  const f = p => (p ? p.map(x => x.toFixed(2)).join(', ') : '-');
  for (const r of missing) md += `| ${r.city.name} (${r.city.country}) | ${f(r.fb)} | ${f(r.ne)} | ${r.d == null ? '-' : Math.round(r.d) + ' km'} |\n`;
}
await fs.mkdir(root + 'review', { recursive: true });
await fs.writeFile(root + 'review/countries.md', md);

const count = s => facts.filter(f => f.status === s).length;
console.log(`countries ${countries.length}, cities ${cities.length} (${cities.filter(c => c.lat).length} with a checked position), languages ${langs.length}`);
console.log(`facts: approved ${count('approved')}, draft ${count('draft')}, rejected ${count('rejected')}, excluded ${count('excluded')}`);
for (const rel of ['continent', 'capital', 'official_language', 'borders'])
  console.log(` ${rel}: ${facts.filter(f => f.relation === rel && f.status === 'approved').length} approved / ${facts.filter(f => f.relation === rel && f.status === 'draft').length} draft`);

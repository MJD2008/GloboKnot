// Imports the geography module: each country's highest point (peaks) and major rivers with the countries they
// flow through. Same rules as the countries module (docs/KNOWLEDGE-SYSTEM.md):
//   approved - two independent sources agree, or a decision in data/geo/decisions.csv says so
//   draft    - only one source has it, or they disagree: listed in review/geo.md
// Sources: CIA World Factbook (names, heights, which countries a river crosses) and Natural Earth 1:10m
// (peak positions and heights, river courses). A river crosses a country when Natural Earth's course passes
// through that country's 1:50m outline.
// Writes data/geo/peaks.csv, rivers.csv, facts.csv, review/geo.md and public/data/rivers.json (courses for the map).
// Run: node scripts/import-geo.mjs
import fs from 'node:fs/promises';
import { feature } from 'topojson-client';
import { geoContains, geoDistance, geoBounds, geoLength } from 'd3-geo';
import { parseCsv, toCsv } from './lib/csv.mjs';
import { decodeHtml, norm, slug } from './lib/text.mjs';
import { distance } from './lib/match.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => fs.readFile(root + p, 'utf8');
const TODAY = JSON.parse(await read('sources/manifest.json')).fetched_on;
const countries = parseCsv(await read('data/countries/countries.csv'));
const codes = parseCsv(await read('sources/cache/country-codes.csv'));
const decisions = parseCsv(await read('data/geo/decisions.csv').catch(() => 'subject,relation,object,decision,name,aliases,ne_name,lat,lng,note,by,date\n'));
const factbook = {};
for (const c of countries) {
  const fips = codes.find(r => r['ISO3166-1-Alpha-3'] === c.id)?.FIPS?.toLowerCase();
  if (fips) factbook[c.id] = JSON.parse(await read(`sources/cache/factbook/${fips}.json`).catch(() => 'null'));
}
const topo = JSON.parse(await read('node_modules/world-atlas/countries-50m.json'));
// Several Natural Earth shapes can share a country's code (Australia's includes Ashmore and Cartier Islands).
const shapes = new Map();
for (const f of feature(topo, topo.objects.countries).features) {
  const c = countries.find(c => +c.iso_numeric === +f.id);
  if (!c) continue;
  const s = shapes.get(c.id) || shapes.set(c.id, { parts: [] }).get(c.id);
  s.parts.push({ f, b: geoBounds(f) });
}
const contains = (s, p) => s.parts.some(x => inBox(p, x.b) && geoContains(x.f, p));
const RAD = 6371;
const km = (a, b) => geoDistance(a, b) * RAD;
const inBox = ([x, y], [[x0, y0], [x1, y1]]) => y >= y0 - 0.5 && y <= y1 + 0.5 && (x0 <= x1 ? x >= x0 - 0.5 && x <= x1 + 0.5 : x >= x0 - 0.5 || x <= x1 + 0.5);
const countryAt = p => { for (const [id, s] of shapes) if (contains(s, p)) return id; return null; };

// Country names as the Factbook writes them in "shared with" lists.
const countryByName = new Map();
for (const c of countries) for (const n of [c.name, ...c.aliases.split('|')]) if (n) countryByName.set(norm(n), c.id);
for (const [n, id] of Object.entries({ burma: 'MMR', 'democratic republic of the congo': 'COD', 'republic of the congo': 'COG',
  'congo republic': 'COG', 'republic of congo': 'COG', czechia: 'CZE', 'cote divoire': 'CIV', turkey: 'TUR', turkiye: 'TUR', 'north korea': 'PRK',
  'south korea': 'KOR', 'the gambia': 'GMB', eswatini: 'SWZ', 'north macedonia': 'MKD', 'timor leste': 'TLS', 'holy see': 'VAT' }))
  countryByName.set(norm(n), id);
const countryId = n => countryByName.get(norm(n.replace(/\(.*?\)/g, '')));

// Similar names: equal after dropping generic words, or close in spelling (Phu Bia / Phou Bia, El'brus / Elbrus).
const GENERIC = /\b(mount|mt|mont|monte|montes|pico|pic|cerro|nevado|volcan|volcano|jabal|jebel|jebal|gebel|gunung|peak|pik|gora|hora|qullai|kuh|kuh e|hill|top|the|de|del|la|le|el|river|rio|fleuve|nahr)\b/g;
const core = s => norm(s).replace(GENERIC, ' ').replace(/\s+/g, '');
function similar(a, b) {
  const x = core(a), y = core(b);
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))) return true;
  return distance(x, y) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 5));
}
/** The same name in another spelling (no "contains" test: "Tajumulco" is not "Tajumulco y Tacaná"). */
function close(a, b) {
  const x = core(a), y = core(b);
  return x === y || distance(x, y) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 5));
}
const decisionOf = (s, r, o) => decisions.find(d => d.subject === s && d.relation === r && (!o || d.object === o));

// ---------------------------------------------------------------- Peaks: each country's highest point
const nePeaks = JSON.parse(await read('sources/cache/ne-elevation-points.geojson')).features
  .map(f => ({ ...f.properties, ll: f.geometry.coordinates }))
  .filter(p => p.name);
// Natural Earth's English name is shown, except where it names the massif or a rarer form.
const DISPLAY = { 'Mountain of Smoke': 'Jabal ad Dukhan', 'Monte Rosa Massif': 'Dufourspitze', 'Volcán Tajumulco y Tacana': 'Volcán Tajumulco',
  'Marrah Mountains': 'Jebel Marra', 'Mount Richard-Molard': 'Mount Nimba', 'Baekdu Mountain': 'Mount Paektu' };
const peaks = new Map(), facts = [], review = { peaks: [], rivers: [] }, nearby = {};
function addPeak(id, name, aliases, elevation, ll, position) {
  const p = peaks.get(id);
  if (p) { aliases.forEach(a => p.aliases.add(a)); return p; }
  const q = { id, name, aliases: new Set(aliases), elevation, lat: ll[1].toFixed(3), lng: ll[0].toFixed(3), position };
  peaks.set(id, q);
  return q;
}
for (const c of countries) {
  const text = decodeHtml(factbook[c.id]?.Geography?.Elevation?.['highest point']?.text || '');
  const m = text.match(/^(.*?)\s*(?:\([^)]*\))?\s+(-?\d[\d,]*)(?:\s*m)?(?![\d,])/);
  const d = decisionOf(c.id, 'highest_point');
  if (d?.decision === 'rejected') { review.peaks.push({ c, text, why: `rejected: ${d.note}` }); continue; }
  if (d?.decision === 'approved') {
    // Position: a Natural Earth peak the decision names, or coordinates in the decision.
    const ne = d.ne_name && nePeaks.find(p => p.name === d.ne_name);
    if (d.ne_name && !ne) throw new Error(`decision for ${c.id}: no Natural Earth peak named ${d.ne_name}`);
    const p = addPeak(d.object, d.name, d.aliases.split('|').filter(a => a && a !== d.name), m ? +m[2].replace(/,/g, '') : ne.elevation,
      ne ? ne.ll : [+d.lng, +d.lat], ne ? 'naturalearth' : 'decision');
    facts.push({ subject: c.id, relation: 'highest_point', object: p.id, sources: 'factbook+decision', status: 'approved', checked: `${d.by}:${d.date}`, note: d.note });
    continue;
  }
  if (!m) { review.peaks.push({ c, text, why: 'no height in the Factbook' }); continue; }
  const fbName = m[1].replace(/\s+on\s+.*$/i, '').trim(); // "Konigstein on Brandberg", "Margherita Peak on Mount Stanley"
  // Other names: after "on", or in brackets ("Nayramadlin Orgil (Khuiten Peak)", "Ntheledi (Mafadi)").
  const onName = (m[1].match(/\s+on\s+(?:the\s+)?(.*)$/i) || [])[1];
  const bracket = (text.match(/^[^(]*\(([^)]*)\)\s+-?\d/) || [])[1]?.split(/\s+or\s+/);
  const elevation = +m[2].replace(/,/g, '');
  const shape = shapes.get(c.id);
  // Natural Earth peaks inside the country or within 25 km of it (border peaks: K2, Everest).
  const near = nePeaks.filter(p => shape && (contains(shape, p.ll) || shape.parts.some(x => inBox(p.ll, x.b) && nearShape(p.ll, x.f, 25))));
  const names = p => [p.name, p.name_en, p.name_alt, p.label].filter(Boolean);
  const other = [onName, ...(bracket || []).filter(b => /^\p{Lu}/u.test(b) && b.split(/\s+/).length <= 4)].filter(Boolean);
  const hit = near.find(p => names(p).some(n => similar(n, fbName) || other.some(o => similar(n, o))) && Math.abs(p.elevation - elevation) <= Math.max(150, elevation * 0.05));
  if (!hit) nearby[c.id] = near.map(p => `${p.name} ${p.elevation}`);
  if (!hit) { review.peaks.push({ c, text, why: near.length ? `no Natural Earth peak with this name and height (${near.length} nearby)` : 'no Natural Earth peak nearby' }); continue; }
  const neName = hit.name_en || hit.name;
  const name = DISPLAY[neName] || neName;
  const p = addPeak(slug(name), name, [fbName, ...other, hit.name, hit.name_en, hit.name_alt].filter(n => n && n !== name && !/\bunnamed\b/i.test(n)), elevation, hit.ll, 'naturalearth');
  facts.push({ subject: c.id, relation: 'highest_point', object: p.id, sources: 'factbook+naturalearth', status: 'approved', checked: `auto:${TODAY}`, note: '' });
}
/** Is the point within `limit` km of the shape's outline? (Coarse: checks the outline's vertices.) */
function nearShape(p, f, limit) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) for (const q of ring) if (km(p, q) <= limit) return true;
  return false;
}

// ---------------------------------------------------------------- Rivers: Factbook's major rivers + Natural Earth courses
const neRivers = JSON.parse(await read('sources/cache/ne-rivers.geojson')).features.filter(f => f.properties.name && f.geometry);
// English names and the parts of a river Natural Earth names separately (the Nile above Khartoum is the White Nile...).
const EXTRA_RIVER_NAMES = {
  huanghe: ['Yellow', 'Huang'], pearl: ['Zhu Jiang'], nile: ['White Nile', 'Mountain Nile', 'Albert Nile', 'Victoria Nile', 'Kagera'],
  congo: ['Lualaba', 'Chambeshi'], euphrates: ['Al Furat', 'Firat'], tigris: ['Dicle'], yenisey: ['Yenisei'],
  irrawaddy: ['Ayeyarwady'], tagus: ['Tajo', 'Tejo'], saintlawrence: ['St. Lawrence'], riogrande: ['Rio Bravo'],
  ubangi: ['Oubangui'], oubangui: ['Ubangi'], zambeze: ['Zambezi'], paran: ['Parana'],
};
const fbRivers = [];
for (const c of countries) {
  const text = decodeHtml(factbook[c.id]?.Geography?.['Major rivers (by length in km)']?.text || '').split(/\bnote\b\s*:/i)[0];
  for (let part of text.split(';')) {
    part = part.replace(/(\[[sm/]+\])\)(?=,| and)/g, '$1').replace(/\((?:river\s+)?(?:mouth|source)\s+shared with/i, '(shared with').replace(/\s+river\s+\[[sm/]+\]/gi, ' river').replace(/\s+(mouth|source)\s+shared with ([^-(]*?)\s+-/i, ' river $1 (shared with $2) -');
    const m = part.trim().match(/^(.*?)(?:\s+river\s+(?:source and mouth|source|mouth))?\s*(?:\(shared with ([^)]*)\))?\s*-\s*([\d,]+)\s*km/i);
    if (!m) continue;
    let raw = m[1].replace(/\s+(?:river\s+)?(source and mouth|source|mouth)$/i, '').replace(/\s*\[[sm/]+\]/g, '').replace(/\s+river$/i, '').trim();
    const en = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/); // "Rijn (Rhine)": English name in brackets
    const names = en ? [en[2], en[1]] : [raw];
    // "Río de la Plata/Paraná", "Ob-Irtysh": the system and its parts; "Red river" is "Red".
    // The display name is the river itself: "Paraná" for the Río de la Plata/Paraná system, "Murray" for "River Murray".
    if (names[0].includes('/')) names.unshift(names[0].split('/').at(-1).trim());
    const all = names.flatMap(n => [n, ...n.split(/\s*[\/]\s*|(?<=\p{L})-(?=\p{Lu})/u)]).map(n => n.replace(/\s+river$/i, '').replace(/^river\s+/i, '').trim()).filter(Boolean);
    for (const n of [...all]) for (const x of EXTRA_RIVER_NAMES[core(n)] || []) all.push(x);
    const shared = (m[2] || '').replace(/\band\b/g, ',').split(',').map(s => s.trim()).filter(Boolean)
      .map(s => ({ id: countryId(s.replace(/\[[sm\/]+\]/g, '').trim()), raw: s }));
    for (const s of shared) if (!s.id) console.log('unknown country in Factbook rivers:', s.raw, `(${c.id})`);
    fbRivers.push({ country: c.id, names: [...new Set(all)], km: +m[3].replace(/,/g, ''),
      countries: [c.id, ...shared.map(s => s.id).filter(Boolean)] });
  }
}
// Merge the per-country entries: the same name and overlapping countries is the same river (two "Red" rivers are not).
const rivers = [];
for (const e of fbRivers) {
  const same = rivers.find(r => r.names.some(n => e.names.some(x => core(x) === core(n))) && r.countries.some(c => e.countries.includes(c)));
  if (same) { e.names.forEach(n => same.names.includes(n) || same.names.push(n)); e.countries.forEach(c => same.countries.includes(c) || same.countries.push(c)); same.km = Math.max(same.km, e.km); }
  else rivers.push({ ...e, names: [...e.names], countries: [...e.countries] });
}
const courses = {};
for (const r of rivers) {
  // Natural Earth segments with one of the river's names, near the countries the Factbook names.
  const segs = neRivers.filter(f => [f.properties.name, f.properties.name_en, f.properties.name_alt].filter(Boolean)
    .some(n => r.names.some(x => core(x) === core(n))) && touches(f, r.countries));
  r.id = slug(r.names[0]);
  if (rivers.filter(x => slug(x.names[0]) === r.id).length > 1) r.id += '-' + r.countries[0].toLowerCase();
  const lines = mainSystem(segs.flatMap(f => f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const crossed = new Map();
  for (const line of lines) for (let i = 0; i < line.length; i++) {
    const p = line[i], id = countryAt(p);
    if (id) crossed.set(id, (crossed.get(id) || 0) + (i ? km(line[i - 1], p) : 0));
  }
  r.ne = [...crossed].filter(([, d]) => d >= 15).map(([id]) => id); // at least 15 km of the course
  r.length = Math.round(geoLength({ type: 'MultiLineString', coordinates: lines }) * RAD);
  if (lines.length) courses[r.id] = simplifyLines(lines, 0.03);
  const name = r.names[0];
  for (const c of new Set([...r.countries, ...r.ne])) {
    const d = decisionOf(r.id, 'flows_through', c);
    const both = r.countries.includes(c) && r.ne.includes(c);
    const status = d ? d.decision : both ? 'approved' : 'draft';
    const sources = [r.countries.includes(c) && 'factbook', r.ne.includes(c) && 'naturalearth', d && 'decision'].filter(Boolean).join('+');
    facts.push({ subject: r.id, relation: 'flows_through', object: c, sources, status, checked: d ? `${d.by}:${d.date}` : both ? `auto:${TODAY}` : '', note: d?.note || '' });
    if (status === 'draft') review.rivers.push({ r, c, why: r.countries.includes(c) ? (lines.length ? 'Factbook only: the Natural Earth course does not cross it' : 'Factbook only: no Natural Earth course found') : 'Natural Earth course only' });
  }
  r.name = name;
}
/** Keep the longest group of connected lines (gaps up to 100 km, for lakes): Natural Earth has two "Red" rivers in the
 *  United States and two "Colorado" rivers; only the one the Factbook means is long enough to win. */
function mainSystem(lines) {
  const group = lines.map((_, i) => i);
  const find = i => (group[i] === i ? i : (group[i] = find(group[i])));
  const pts = lines.map(l => l.filter((_, i) => i % 3 === 0 || i === l.length - 1));
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    if (find(i) === find(j)) continue;
    if (pts[i].some(p => pts[j].some(q => Math.abs(p[1] - q[1]) < 1 && km(p, q) <= 100))) group[find(i)] = find(j);
  }
  const total = new Map();
  lines.forEach((l, i) => total.set(find(i), (total.get(find(i)) || 0) + geoLength({ type: 'LineString', coordinates: l })));
  const best = [...total].sort((a, b) => b[1] - a[1])[0]?.[0];
  return lines.filter((_, i) => find(i) === best);
}
function touches(f, ids) {
  const coords = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
  for (let i = 0; i < coords.length; i += 5) { const id = countryAt(coords[i]); if (id && ids.includes(id)) return true; }
  return false;
}
/** Douglas-Peucker on lon/lat degrees, then 2 decimals: light enough for the map. */
function simplifyLines(lines, tol) {
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts.at(-1)];
    let max = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [x1, y1] = a, [x2, y2] = b;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
      const dist = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (dist > max) { max = dist; at = i; }
    }
    return max > tol ? [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))] : [a, b];
  };
  return lines.map(l => dp(l).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
}

// ---------------------------------------------------------------- Write
const used = new Set(facts.filter(f => f.relation === 'flows_through').map(f => f.subject));
const riverRows = rivers.filter(r => used.has(r.id)).map(r => ({ id: r.id, name: r.name, aliases: r.names.slice(1).filter(n => n !== r.name).join('|'),
  length_km: r.km, course: courses[r.id] ? 'naturalearth' : '' }));
const peakRows = [...peaks.values()].map(p => ({ ...p, aliases: [...p.aliases].filter(a => a !== p.name).join('|') }));
const order = { approved: 0, draft: 1, rejected: 2 };
facts.sort((a, b) => a.relation.localeCompare(b.relation) || order[a.status] - order[b.status] || a.subject.localeCompare(b.subject) || a.object.localeCompare(b.object));
await fs.mkdir(root + 'data/geo', { recursive: true });
await fs.writeFile(root + 'data/geo/peaks.csv', toCsv(peakRows.sort((a, b) => a.id.localeCompare(b.id)), ['id', 'name', 'aliases', 'elevation', 'lat', 'lng', 'position']));
await fs.writeFile(root + 'data/geo/rivers.csv', toCsv(riverRows.sort((a, b) => a.id.localeCompare(b.id)), ['id', 'name', 'aliases', 'length_km', 'course']));
await fs.writeFile(root + 'data/geo/facts.csv', toCsv(facts, ['subject', 'relation', 'object', 'sources', 'status', 'checked', 'note']));
const keep = Object.fromEntries(Object.entries(courses).filter(([id]) => facts.some(f => f.subject === id && f.status === 'approved')));
await fs.writeFile(root + 'public/data/rivers.json', JSON.stringify(keep));

let md = `# Review queue: geography\n\nGenerated by scripts/import-geo.mjs on ${TODAY}. Record each decision in data/geo/decisions.csv, then re-run.\n`;
md += `\n## Highest points without a second source (${review.peaks.length})\n\nThe Factbook names these, but no Natural Earth peak with the same name and height was found, so there is no position for the map yet.\n\n`;
md += review.peaks.map(x => `- ${x.c.name} (${x.c.id}): ${x.text || '(none)'}. ${x.why}${nearby[x.c.id]?.length ? `: ${nearby[x.c.id].join(', ')}` : ''}`).join('\n') + '\n';
md += `\n## Rivers: countries only one source names (${review.rivers.length})\n\n`;
md += review.rivers.map(x => `- ${x.r.name} (${x.r.id}) in ${countries.find(c => c.id === x.c)?.name || x.c}: ${x.why}`).join('\n') + '\n';
await fs.writeFile(root + 'review/geo.md', md);
const n = (rel, s) => facts.filter(f => f.relation === rel && f.status === s).length;
console.log(`peaks: ${n('highest_point', 'approved')} countries approved, ${review.peaks.length} to review`);
console.log(`rivers: ${riverRows.length} rivers, ${n('flows_through', 'approved')} approved / ${n('flows_through', 'draft')} draft crossings, ${Object.keys(keep).length} courses, ${(JSON.stringify(keep).length / 1024).toFixed(0)} KB`);

// Builds public/data/sheets.json: what a country's sheet shows beyond the knowledge base's facts (James, 16 Nov 2026:
// "a more comprehensive information dataset for each country", with its major rivers and, where relevant, notable
// peaks). Display only: the quiz never asks about these, so unlike the knowledge base they need no second source.
//   Rivers: up to six. The country's rivers from the knowledge base first (the longest), then Natural Earth's that
//     run longest in it: at least 25 km, and at least 30% of the longest of them there (Spain: the Ebro, the Douro,
//     the Guadalquivir and the Guadiana, not the Esla that feeds the Douro). A delta's branches are left out. Courses
//     of the knowledge base's rivers stay in rivers.json; the others are written here.
//   Peaks: besides its highest point (in the knowledge base), up to five Natural Earth mountains of 1,000 m or more in
//     the country, or on its border (2,000 m or more, within about 3 km of it; some other country's highest point only
//     when famous, and within about 1 km), famous ones first, at least 4 km apart (Lhotse is
//     Everest's shoulder). Only those on the sheet's map: Réunion's peaks are French, but far from France. Plus
//     data/geo/notable-peaks.csv for famous peaks Natural Earth lacks, or whose height it gives wrongly (its `sheets`:
//     the countries whose sheet lists it). A peak that is some country's highest point keeps the knowledge base's name
//     and height.
// Inputs: public/data/countries.json, public/data/rivers.json, sources/cache/ne-rivers.geojson,
// sources/cache/ne-elevation-points.geojson, world-atlas 1:50m, data/geo/notable-peaks.csv.
// Run: node scripts/build-sheets.mjs (npm run build:sheets)
import fs from 'node:fs/promises';
import { feature } from 'topojson-client';
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoLength } from 'd3-geo';
import { parseCsv } from './lib/csv.mjs';
import { norm, slug } from './lib/text.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => fs.readFile(root + p, 'utf8');
const kb = JSON.parse(await read('public/data/countries.json'));
const kbCourses = JSON.parse(await read('public/data/rivers.json'));
const RAD = 6371, MAX_RIVERS = 6, MAX_PEAKS = 5, DEG = 180 / Math.PI;
const km = (a, b) => geoDistance(a, b) * RAD;

// ---------------------------------------------------------------- countries' shapes (1:50m, as on the site's maps)
const topo = JSON.parse(await read('node_modules/world-atlas/countries-50m.json'));
const byNum = new Map(kb.countries.map(c => [+c.num, c.id]));
const shapes = new Map();
for (const f of feature(topo, topo.objects.countries).features) {
  const id = byNum.get(+f.id);
  if (!id) continue;
  const s = shapes.get(id) || shapes.set(id, { parts: [] }).get(id);
  s.parts.push({ f, b: geoBounds(f) });
}
/** What a country's sheet map shows: a circle round its main part (as map.ts draws it), [lon, lat] and degrees. */
const views = new Map();
for (const [id, s] of shapes) {
  let best = null, area = -1;
  for (const { f } of s.parts) for (const rings of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) {
    const poly = { type: 'Polygon', coordinates: rings };
    const a = Math.min(geoArea(poly), 4 * Math.PI - geoArea(poly));
    if (a > area) { area = a; best = poly; }
  }
  const c = geoCentroid(best);
  let reach = 0;
  for (const p of best.coordinates[0]) reach = Math.max(reach, geoDistance(c, p) * DEG);
  views.set(id, { c, r: Math.min(60, Math.max(7, reach * 1.5 + 2)) });
}
const onMap = (id, p) => { const v = views.get(id); return !v || geoDistance(v.c, p) * DEG <= v.r; };
const inBox = ([x, y], [[x0, y0], [x1, y1]]) => y >= y0 - 0.5 && y <= y1 + 0.5 && (x0 <= x1 ? x >= x0 - 0.5 && x <= x1 + 0.5 : x >= x0 - 0.5 || x <= x1 + 0.5);
const contains = (s, p) => s.parts.some(x => inBox(p, x.b) && geoContains(x.f, p));
const countryAt = p => { for (const [id, s] of shapes) if (contains(s, p)) return id; return null; };
/** The countries at a point and those within `reach` degrees of it (a summit on a border). */
const countriesNear = (p, reach) => {
  const ids = new Set([countryAt(p)].filter(Boolean));
  if (reach) for (let a = 0; a < 8; a++) {
    const q = [p[0] + reach * Math.cos((a * Math.PI) / 4) / Math.cos((p[1] * Math.PI) / 180), p[1] + reach * Math.sin((a * Math.PI) / 4)];
    const id = countryAt(q);
    if (id) ids.add(id);
  }
  return [...ids];
};

// ---------------------------------------------------------------- rivers
const name = id => kb.countries.concat(kb.cities, kb.languages, kb.peaks, kb.rivers).find(e => e.id === id)?.name ?? id;
const kbRiver = new Map(kb.rivers.map(r => [r.id, r]));
const flows = new Map(); // country -> its knowledge-base rivers
for (const [s, rel, o, q] of kb.facts) if (rel === 'flows_through' && q !== 'also') (flows.get(o) || flows.set(o, []).get(o)).push(s);
// English names where Natural Earth gives the local one (or a mangled one).
// Natural Earth's large-scale rivers lost some letters (Sane for Saône, Glma for Glomma): those put back too, and one
// river under two names (the Benue in Cameroon and in Nigeria) gets one.
const ENGLISH = { Maas: 'Meuse', Schelde: 'Scheldt', Duero: 'Douro', Glma: 'Glomma', Mosel: 'Moselle', 'Zapadnaya Dvina': 'Daugava',
  Nemunas: 'Neman', Tevere: 'Tiber', Sane: 'Saône', Mio: 'Minho', Zncara: 'Záncara', Sapt: 'Koshi', Gandak: 'Gandaki',
  Tisa: 'Tisza', Ertis: 'Irtysh', Esil: 'Ishim', Ile: 'Ili', Nu: 'Salween', Bénoué: 'Benue', Corantijn: 'Courantyne',
  'Oued Sebou': 'Sebou', Shabeelle: 'Shebelle', Shebele: 'Shebelle', 'Kiz?lirmak': 'Kızılırmak', Klarlven: 'Klarälven',
  'Ro Grande de Matagalpa': 'Río Grande de Matagalpa', Skelleftelven: 'Skellefteälven', Tornelven: 'Torne',
  ngermanlven: 'Ångermanälven', 'Chirrip del Atlntico': 'Chirripó', Truma: 'Struma', Mytinge: 'Myitnge', Ula: 'Ulúa',
  'Santa Mara': 'Santa María', Mamas: 'Manas', Balak: 'Barak', Masi: 'Musi', Kong: 'Sekong' };
// A name of two letters reads better with "River" (the Ba, the Ca and the Ou of Vietnam and Laos); the Po needs none.
const riverName = p => {
  const n = (p.name_en || p.name).replace(/\s+/g, ' ').trim(), e = ENGLISH[n] ?? ENGLISH[p.name] ?? n;
  return e.length <= 2 && e !== 'Po' ? `${e} River` : e;
};
const core = s => norm(s).replace(/\b(river|rio|fleuve|nahr|the)\b/g, '').replace(/\s+/g, '');
// A knowledge-base river by its name, and near its course: Argentina's Río Negro is not the Amazon's.
const kbByCore = new Map();
for (const r of kb.rivers) for (const n of [r.name, ...r.aliases]) (kbByCore.get(core(n)) || kbByCore.set(core(n), []).get(core(n))).push(r.id);
const nearCourse = (id, lines) => {
  const course = (kbCourses[id] ?? []).flat();
  return lines.some(l => l.some((p, i) => i % 4 === 0 && course.some(q => Math.abs(p[1] - q[1]) < 1 && km(p, q) < 60)));
};
const isKb = (n, lines) => (kbByCore.get(core(n)) ?? []).some(id => nearCourse(id, lines));
const linesOf = f => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates);
const all = JSON.parse(await read('sources/cache/ne-rivers.geojson')).features.filter(f => f.properties.featurecla === 'River');
// (Natural Earth's Vorma takes in stretches of the Glomma, so it is left out.)
// Natural Earth leaves a few stretches unnamed (the Tisza through Hungary, named only from Serbia on): such a stretch
// takes the name of a river of the same rank that it meets end to end.
const ends = f => linesOf(f).flatMap(l => [l[0], l.at(-1)]);
for (let pass = 0, more = true; more && pass < 6; pass++) {
  more = false;
  for (const f of all) {
    if (f.properties.name_en || f.properties.name) continue;
    const mine = ends(f);
    const m = all.find(g => g !== f && (g.properties.name_en || g.properties.name) && g.properties.scalerank === f.properties.scalerank
      && ends(g).some(p => mine.some(q => Math.abs(p[1] - q[1]) < 0.1 && km(p, q) < 3)));
    if (m) { f.properties.name_en = m.properties.name_en || m.properties.name; more = true; }
  }
}
const ne = all.filter(f => (f.properties.name_en || f.properties.name) && !/delta|canal|channel|branch|soroksari|shatt al hillah|^vorma$/i.test(f.properties.name_en || f.properties.name));
// Segments by name, then by connected system (two rivers can share a name: the Red River of Vietnam and of the USA).
const byName = new Map();
for (const f of ne) {
  const n = riverName(f.properties);
  const lines = linesOf(f);
  if (isKb(n, lines)) continue; // a knowledge-base river: its course is in rivers.json
  const e = byName.get(n) || byName.set(n, { lines: [], rank: 99 }).get(n);
  e.lines.push(...lines);
  e.rank = Math.min(e.rank, f.properties.scalerank);
}
const systems = [];
for (const [n, e] of byName) {
  const group = e.lines.map((_, i) => i);
  const find = i => (group[i] === i ? i : (group[i] = find(group[i])));
  const pts = e.lines.map(l => l.filter((_, i) => i % 3 === 0 || i === l.length - 1));
  for (let i = 0; i < e.lines.length; i++) for (let j = i + 1; j < e.lines.length; j++) {
    if (find(i) !== find(j) && pts[i].some(p => pts[j].some(q => Math.abs(p[1] - q[1]) < 1 && km(p, q) <= 100))) group[find(i)] = find(j);
  }
  const sets = new Map();
  e.lines.forEach((l, i) => (sets.get(find(i)) || sets.set(find(i), []).get(find(i))).push(l));
  for (const lines of sets.values()) systems.push({ name: n, rank: e.rank, lines });
}
for (const s of systems) {
  s.in = new Map(); // country -> km of course in it
  for (const line of s.lines) for (let i = 1; i < line.length; i++) {
    const id = countryAt(line[i]);
    if (id) s.in.set(id, (s.in.get(id) || 0) + km(line[i - 1], line[i]));
  }
  s.km = Math.round(geoLength({ type: 'MultiLineString', coordinates: s.lines }) * RAD);
}

const kbIn = new Map(); // river -> country -> km of course in it
for (const [id, lines] of Object.entries(kbCourses)) {
  const m = new Map();
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const c = countryAt(line[i]);
    if (c) m.set(c, (m.get(c) || 0) + km(line[i - 1], line[i]));
  }
  kbIn.set(id, m);
}

// ---------------------------------------------------------------- peaks
const kbPeakOf = new Map(kb.facts.filter(f => f[1] === 'highest_point').map(f => [f[0], f[2]]));
const kbPeaks = kb.peaks;
const GENERIC = /\b(mount|mt|mont|monte|pico|pic|cerro|nevado|volcan|volcano|gunung|peak|pik|gora|kuh e|kuh|the|de|del|la|le|el)\b/g;
const pcore = s => norm(s).replace(GENERIC, ' ').replace(/\s+/g, '');
const RANGE = /\b(mountains|cordillera|massif|hills|group|monts|range)\b/i;
const cleanPeak = n => n.replace(/\s+volcano$/i, '').replace(/^Volcán\s+/, '');
/** A knowledge-base peak at the same place, so that a highest point keeps one name and height everywhere. */
const kbPeakAt = (ll, n) => kbPeaks.find(k => km([k.ll[1], k.ll[0]], ll) < 6 && (pcore(k.name) === pcore(n) || km([k.ll[1], k.ll[0]], ll) < 2));
const candidates = [];
for (const f of JSON.parse(await read('sources/cache/ne-elevation-points.geojson')).features) {
  const p = f.properties, ll = f.geometry.coordinates;
  if (p.featurecla !== 'mountain' || !(p.elevation >= 1000)) continue;
  const n = cleanPeak(p.name_en || p.name || '');
  if (!n || RANGE.test(n)) continue;
  candidates.push({ name: n, m: p.elevation, ll, rank: p.scalerank });
}
const extra = parseCsv(await read('data/geo/notable-peaks.csv'));
for (const row of extra) {
  const ll = [+row.lng, +row.lat];
  // It replaces Natural Earth's point for the same peak (a better height), or adds one Natural Earth lacks.
  const same = candidates.findIndex(c => km(c.ll, ll) < 5 && (pcore(c.name) === pcore(row.name) || row.aliases.split('|').some(a => a && pcore(a) === pcore(c.name))));
  const peak = { name: row.name, m: +row.elevation, ll, rank: 0, countries: row.sheets.split('|'), famous: true };
  if (same >= 0) candidates.splice(same, 1, peak); else candidates.push(peak);
}
// Famous ones first, wherever Natural Earth ranks them.
const FAMOUS = new Set(['Matterhorn', 'Monte Rosa', 'K2', 'Nanga Parbat', 'Dhaulagiri', 'Mount Etna', 'Mount Vesuvius', 'Mount Rainier', 'Mount Whitney',
  'Grand Teton', 'Mount Shasta', 'Mauna Kea', 'Mount Robson', 'Popocatépetl', 'Cotopaxi', 'Illimani', 'Ojos del Salado', 'Tupungato',
  'Mount Kailash', 'Klyuchevskaya Sopka', 'Mulhacén', 'Aneto', 'Mount Ruapehu', 'Mount Taranaki', 'Snowdon', 'Mount Kinabalu', 'Aconcagua'].map(pcore));
for (const c of candidates) {
  c.famous ||= FAMOUS.has(pcore(c.name));
  const k = kbPeakAt(c.ll, c.name);
  if (k) { c.name = k.name; c.m = k.m; c.kb = k.id; }
  c.countries ??= countriesNear(c.ll, c.kb ? 0.012 : c.m >= 2000 ? 0.03 : 0);
}

// ---------------------------------------------------------------- per country
const out = { rivers: {}, countries: {} };
const ids = new Map(); // system -> id written
const r2 = x => Math.round(x * 100) / 100;
for (const c of kb.countries) {
  const own = (flows.get(c.id) ?? []).sort((a, b) => (kbRiver.get(b)?.km ?? 0) - (kbRiver.get(a)?.km ?? 0)).slice(0, MAX_RIVERS);
  const inside = s => s.in.get(c.id) ?? 0;
  const longest = Math.max(0, ...systems.map(inside));
  const more = systems.filter(s => inside(s) >= Math.max(25, 0.3 * longest) && s.lines.some(l => l.some(p => onMap(c.id, p))))
    .sort((a, b) => inside(b) - inside(a))
    .filter((s, i, all) => all.findIndex(t => t.name === s.name) === i) // one river of a name per country
    .slice(0, MAX_RIVERS - own.length);
  const rivers = [...own];
  for (const s of more) {
    if (!ids.has(s)) {
      let id = slug(s.name);
      while (out.rivers[id] || kbCourses[id]) id += '-' + c.id.toLowerCase();
      ids.set(s, id);
      out.rivers[id] = { n: s.name, c: simplify(s.lines, 0.02).map(l => l.map(([x, y]) => [r2(x), r2(y)])) };
    }
    rivers.push(ids.get(s));
  }
  const highest = kbPeakOf.get(c.id);
  const top = kbPeaks.find(k => k.id === highest);
  const picked = top ? [{ ll: [top.ll[1], top.ll[0]] }] : [];
  // Some other country's highest point only when famous in its own right (K2 for China, not Liechtenstein's for Switzerland).
  for (const p of candidates.filter(p => p.countries.includes(c.id) && p.kb !== highest && (!p.kb || p.famous) && onMap(c.id, p.ll))
    .sort((a, b) => Number(b.famous) - Number(a.famous) || a.rank - b.rank || b.m - a.m)) {
    if (picked.length - (top ? 1 : 0) >= MAX_PEAKS) break;
    if (picked.some(t => km(t.ll, p.ll) < 4 || (t.name && pcore(t.name) === pcore(p.name)))) continue;
    picked.push(p);
  }
  const peaks = picked.filter(p => p.name).sort((a, b) => b.m - a.m).map(p => [p.name, p.m, r2(p.ll[1]), r2(p.ll[0])]);
  if (rivers.length || peaks.length) out.countries[c.id] = { ...(rivers.length ? { r: rivers } : {}), ...(peaks.length ? { p: peaks } : {}) };
}
await fs.writeFile(root + 'public/data/sheets.json', JSON.stringify(out));
if (process.env.DEBUG) for (const id of process.env.DEBUG.split(',')) {
  console.log('==', id, 'KB:', (flows.get(id) ?? []).map(r => `${r} ${Math.round(kbIn.get(r)?.get(id) ?? 0)}`).join(', '));
  console.log('  NE:', systems.filter(s => (s.in.get(id) ?? 0) >= 10).sort((a, b) => (b.in.get(id) ?? 0) - (a.in.get(id) ?? 0)).slice(0, 14)
    .map(s => `${s.name} r${s.rank} ${s.km}/${Math.round(s.in.get(id))}`).join(' | '));
  console.log('  peaks:', candidates.filter(p => p.countries.includes(id)).sort((a, b) => a.rank - b.rank || b.m - a.m).slice(0, 24)
    .map(p => `${p.name} ${p.m} r${p.rank}${p.famous ? '*' : ''}${p.kb ? '(kb)' : ''}`).join(' | '));
}

const show = ['BEL', 'FRA', 'CHE', 'NPL', 'USA', 'ARG'];
for (const id of show) {
  const e = out.countries[id] ?? {};
  console.log(id, '| rivers:', (e.r ?? []).map(r => out.rivers[r]?.n ?? name(r)).join(', '), '| peaks:', (e.p ?? []).map(p => `${p[0]} ${p[1]}`).join(', '));
}
const n = Object.values(out.countries);
console.log(`${n.length} countries: ${n.filter(e => e.r).length} with rivers, ${n.filter(e => e.p).length} with notable peaks; ${Object.keys(out.rivers).length} more courses; ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);

/** Douglas-Peucker on lon/lat degrees. */
function simplify(lines, tol) {
  const dp = pts => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts.at(-1)];
    let max = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [x1, y1] = a, [x2, y2] = b, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
      const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; at = i; }
    }
    return max > tol ? [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))] : [a, b];
  };
  return lines.map(dp).filter(l => l.length > 1);
}

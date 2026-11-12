// Question templates: each turns approved facts about one subject into a question. Nothing here is a fact itself;
// facts only come from the knowledge base. Prompts are keywords, readable in under a second ("France — Capital?"),
// and every question has one clue: a map, a flag, a text or a name, never two.
import type { Country, Knowledge, Language, Peak, River } from './kb';

export type Cat = 'locations' | 'capitals' | 'flags' | 'languages' | 'mountains' | 'rivers' | 'neighbours';
export type Pool = 'country' | 'city' | 'language' | 'peak' | 'river';
export type LatLng = [number, number];
export type Media =
  | { kind: 'map'; country?: string; dot?: LatLng; peak?: LatLng; river?: string }
  | { kind: 'flag'; country: string }
  | { kind: 'text'; text: string; lang: string }
  | { kind: 'none' };

export interface Choice { id: string; label: string; flag?: string }
export interface Question {
  key: string;                 // template + subject: used to avoid repeats
  kind: string;                // template id
  cat: Cat;
  format: 'type' | 'choice';
  prompt: string;
  clue: string;                // what was asked, for the answers list ("Flag", "Map", "France — Capital?")
  media: Media;
  pools: Pool[];               // which names a typed answer is matched against
  accept: string[];            // entity ids that count as right
  answer: string;              // the right answer as shown
  choices?: Choice[];
  reveal?: string[];           // countries lit up on the map once answered
  countries: string[];         // countries the question is about: none of them comes up twice in a round
}

type Rng = () => number;
interface Template {
  id: string;
  cat: Cat;
  label: string;               // in the menu: what you see → what you answer
  subjects(kb: Knowledge, inPlace: (country: string) => boolean): string[];
  core(kb: Knowledge, id: string): boolean;
  make(kb: Knowledge, id: string, rng: Rng): Omit<Question, 'cat'> | null; // `cat` is filled in by buildRound
}

export const CATS: { id: Cat; label: string }[] = [
  { id: 'locations', label: 'Locations' },
  { id: 'capitals', label: 'Capitals' },
  { id: 'flags', label: 'Flags' },
  { id: 'languages', label: 'Languages' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'rivers', label: 'Rivers' },
  { id: 'neighbours', label: 'Neighbours' },
];

const pickOne = <T>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];
export function shuffle<T>(xs: T[], rng: Rng = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** n distinct keys, each drawn with a chance in proportion to its weight. */
function weightedSample(weights: Map<string, number>, n: number, rng: Rng): string[] {
  return [...weights]
    .map(([id, w]) => ({ id, k: Math.pow(rng(), 1 / w) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, n)
    .map(x => x.id);
}
/** Wrong options that tempt: countries next door count most, then the same continent, then anywhere. */
function nearWeights(kb: Knowledge, c: string, near = 6, sameContinent = 2, far = 0.1) {
  const next = new Set(kb.neighbours(c)), continent = kb.continent(c);
  return (other: string) => (next.has(other) ? near : kb.continent(other) === continent ? sameContinent : far);
}
const list = (names: string[], max = 3) => (names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max}` : names.join(' / '));
const country = (kb: Knowledge, id: string) => kb.country(id)!;
const isCore = (kb: Knowledge, id: string) => kb.country(id)?.tier === 'core';
const countriesIn = (kb: Knowledge, inPlace: (c: string) => boolean) => kb.countries.filter(c => inPlace(c.id)).map(c => c.id);
/** Great-circle distance in km between two [lat, lng] points. */
const km = ([la1, lo1]: [number, number], [la2, lo2]: [number, number]) => {
  const r = Math.PI / 180, h = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// Language tags for the text samples, so each script gets the right font (Japanese vs Chinese forms of the same
// character) and right-to-left scripts run the right way.
const BCP47: Record<string, string> = {
  ara: 'ar', heb: 'he', fas: 'fa', urd: 'ur', div: 'dv', zho: 'zh-Hans', jpn: 'ja', kor: 'ko', tha: 'th', lao: 'lo', khm: 'km',
  mya: 'my', dzo: 'dz', amh: 'am', tir: 'ti', hye: 'hy', kat: 'ka', ber: 'tzm-Tfng', hin: 'hi', nep: 'ne', ben: 'bn', tam: 'ta',
  rus: 'ru', ukr: 'uk', bel: 'be', bul: 'bg', mkd: 'mk', srp: 'sr', kaz: 'kk', kir: 'ky', tgk: 'tg', mon: 'mn', ell: 'el',
};

// ---------------------------------------------------------------- templates
export const TEMPLATES: Template[] = [
  {
    id: 'loc.map', cat: 'locations', label: 'Map → country',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    core: isCore,
    make: (kb, id) => {
      const c = country(kb, id);
      return { key: `map:${id}`, kind: 'loc.map', format: 'type', prompt: 'Country?', clue: 'Map', media: { kind: 'map', country: id },
        pools: ['country'], accept: [id], answer: c.name, countries: [id] };
    },
  },
  {
    id: 'cap.name', cat: 'capitals', label: 'Country → capital',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.mainCapitals(c).length),
    core: isCore,
    make: (kb, id) => {
      const c = country(kb, id);
      const prompt = `${c.name} — Capital?`;
      return { key: `capital:${id}`, kind: 'cap.name', format: 'type', prompt, clue: prompt, media: { kind: 'none' },
        pools: ['city'], accept: kb.capitals(id), answer: kb.mainCapitals(id).map(x => kb.name(x)).join(' / '), countries: [id] };
    },
  },
  {
    id: 'cap.map', cat: 'capitals', label: 'Map → capital',
    // One capital with a checked position: the dot marks it.
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => { const m = kb.mainCapitals(c); return m.length === 1 && kb.cities.find(x => x.id === m[0])?.ll; }),
    core: isCore,
    make: (kb, id) => {
      const city = kb.cities.find(x => x.id === kb.mainCapitals(id)[0])!;
      return { key: `capital-map:${id}`, kind: 'cap.map', format: 'type', prompt: 'Capital?', clue: `Map: ${country(kb, id).name}`,
        media: { kind: 'map', country: id, dot: city.ll }, pools: ['city'], accept: kb.capitals(id), answer: city.name, countries: [id] };
    },
  },
  {
    id: 'cap.reverse', cat: 'capitals', label: 'Capital → country',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.mainCapitals(c).length === 1),
    core: isCore,
    make: (kb, id) => {
      const city = kb.name(kb.mainCapitals(id)[0]);
      const prompt = `${city} — Country?`;
      return { key: `capital-of:${id}`, kind: 'cap.reverse', format: 'type', prompt, clue: prompt, media: { kind: 'none' },
        pools: ['country'], accept: [id], answer: country(kb, id).name, countries: [id] };
    },
  },
  {
    id: 'flag.name', cat: 'flags', label: 'Flag → country',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    core: isCore,
    make: (kb, id) => ({ key: `flag:${id}`, kind: 'flag.name', format: 'type', prompt: 'Flag?', clue: 'Flag',
      media: { kind: 'flag', country: id }, pools: ['country'], accept: [id], answer: country(kb, id).name, countries: [id] }),
  },
  {
    id: 'flag.pick', cat: 'flags', label: 'Country → flag',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    core: isCore,
    make: (kb, id, rng) => {
      const w = nearWeights(kb, id, 8, 3, 0.3);
      const wrong = weightedSample(new Map(kb.countries.filter(o => o.id !== id).map(o => [o.id, w(o.id)])), 3, rng);
      const c = country(kb, id);
      const prompt = `${c.name} — Flag?`;
      return { key: `flag-pick:${id}`, kind: 'flag.pick', format: 'choice', prompt, clue: prompt, media: { kind: 'none' },
        pools: ['country'], accept: [id], answer: c.name, countries: [id],
        choices: shuffle([id, ...wrong], rng).map(x => ({ id: x, label: kb.name(x), flag: country(kb, x).flag })) };
    },
  },
  {
    id: 'lang.text', cat: 'languages', label: 'Text → language or country',
    // Spoken in a selected country (officially or by many people).
    subjects: (kb, inPlace) => kb.languages.filter(l => l.sample && kb.cluster(l.id).some(x => kb.whereSpoken(x).some(inPlace))).map(l => l.id),
    core: (kb, id) => kb.whereSpoken(id, false).some(c => isCore(kb, c)),
    make: (kb, id) => {
      const l = kb.get<Language>(id)!;
      const family = kb.cluster(id);
      const where = [...new Set(family.flatMap(x => kb.whereSpoken(x)))];
      return { key: `text:${id}`, kind: 'lang.text', format: 'type', prompt: 'Language or country?', clue: `“${l.sample}”`,
        media: { kind: 'text', text: l.sample!, lang: BCP47[id] ?? id }, pools: ['language', 'country'], accept: [...family, ...where],
        answer: l.name, countries: [] };
    },
  },
  {
    id: 'lang.official', cat: 'languages', label: 'Country → official language',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.languagesOf(c).length),
    core: isCore,
    make: (kb, id, rng) => {
      const official = kb.languagesOf(id);
      // Sign languages are official in a few countries, but "New Zealand Sign Language" gives itself away as an
      // answer and is no real option for anyone else, so they are never shown.
      const spoken = (l: string) => !/sign language/i.test(kb.name(l));
      const right = pickOne(official.some(spoken) ? official.filter(spoken) : official, rng);
      // official_language is "complete": a language not listed for this country is not official here.
      const w = nearWeights(kb, id);
      const weight = new Map<string, number>();
      for (const other of kb.countries) {
        if (other.id === id) continue;
        for (const l of kb.languagesOf(other.id)) if (!official.includes(l) && spoken(l)) weight.set(l, (weight.get(l) ?? 0) + w(other.id));
      }
      const wrong = weightedSample(weight, 3, rng);
      if (wrong.length < 3) return null;
      const prompt = `${country(kb, id).name} — Language?`;
      return { key: `language:${id}`, kind: 'lang.official', format: 'choice', prompt, clue: prompt, media: { kind: 'none' },
        pools: ['language'], accept: official, answer: kb.name(right), countries: [id],
        choices: shuffle([right, ...wrong], rng).map(x => ({ id: x, label: kb.name(x) })) };
    },
  },
  {
    id: 'peak.name', cat: 'mountains', label: 'Country → highest point',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.highestPoint(c)),
    core: isCore,
    make: (kb, id, rng) => {
      const right = kb.highestPoint(id)!;
      const w = nearWeights(kb, id);
      const weight = new Map<string, number>();
      for (const p of kb.peaks) if (p.id !== right) weight.set(p.id, Math.max(...kb.peakCountries(p.id).map(w)));
      const prompt = `${country(kb, id).name} — Highest point?`;
      return { key: `peak:${id}`, kind: 'peak.name', format: 'choice', prompt, clue: prompt, media: { kind: 'none' },
        pools: ['peak'], accept: [right], answer: kb.name(right), countries: [id],
        choices: shuffle([right, ...weightedSample(weight, 3, rng)], rng).map(x => ({ id: x, label: kb.name(x) })) };
    },
  },
  {
    id: 'peak.map', cat: 'mountains', label: 'Highest point → country',
    subjects: (kb, inPlace) => kb.peaks.filter(p => kb.peakCountries(p.id).some(inPlace)).map(p => p.id),
    core: (kb, id) => kb.peakCountries(id).some(c => isCore(kb, c)) || (kb.get<Peak>(id)?.m ?? 0) >= 5000,
    make: (kb, id) => {
      const p = kb.get<Peak>(id)!, where = kb.peakCountries(id);
      // Two countries' highest points can be a few km apart (Rysy and Gerlachovsky stit are 3 km apart): one
      // triangle can't tell them apart, so the neighbour whose highest point is that close counts as right too.
      const near = kb.peaks.filter(o => o.id !== id && km(o.ll, p.ll) < 25).flatMap(o => kb.peakCountries(o.id));
      return { key: `peak-map:${id}`, kind: 'peak.map', format: 'type', prompt: 'Highest point — Country?', clue: p.name,
        media: { kind: 'map', peak: p.ll }, pools: ['country'], accept: [...new Set([...where, ...near])], answer: where.map(c => kb.name(c)).join(' / '),
        reveal: where, countries: where };
    },
  },
  {
    id: 'river.name', cat: 'rivers', label: 'River → name',
    subjects: (kb, inPlace) => kb.rivers.filter(r => kb.riverCountries(r.id).some(inPlace)).map(r => r.id),
    core: (kb, id) => (kb.get<River>(id)?.km ?? 0) >= 2500 || FAMOUS_RIVERS.has(id),
    make: (kb, id) => {
      const r = kb.get<River>(id)!;
      return { key: `river:${id}`, kind: 'river.name', format: 'type', prompt: 'River?', clue: `River in ${list(kb.riverCountries(id).map(c => kb.name(c)), 2)}`,
        media: { kind: 'map', river: id }, pools: ['river'], accept: kb.rivers.filter(x => x.name === r.name).map(x => x.id),
        answer: r.name, countries: [] };
    },
  },
  {
    id: 'river.map', cat: 'rivers', label: 'River → country',
    subjects: (kb, inPlace) => kb.rivers.filter(r => kb.riverCountries(r.id).some(inPlace)).map(r => r.id),
    core: (kb, id) => (kb.get<River>(id)?.km ?? 0) >= 2500 || FAMOUS_RIVERS.has(id),
    make: (kb, id) => {
      const shown = kb.riverCountries(id);
      return { key: `river-map:${id}`, kind: 'river.map', format: 'type', prompt: 'River — Country?', clue: kb.name(id),
        media: { kind: 'map', river: id }, pools: ['country'], accept: kb.riverCountries(id, true),
        answer: list(shown.map(c => kb.name(c))), reveal: shown, countries: [] };
    },
  },
  {
    id: 'nb.name', cat: 'neighbours', label: 'Country → neighbour',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.neighbours(c).length),
    core: isCore,
    make: (kb, id) => {
      const next = kb.neighbours(id);
      const prompt = `${country(kb, id).name} — Neighbour?`;
      return { key: `neighbour:${id}`, kind: 'nb.name', format: 'type', prompt, clue: prompt, media: { kind: 'none' },
        pools: ['country'], accept: next, answer: list(next.map(c => kb.name(c))), countries: [id] };
    },
  },
];
const FAMOUS_RIVERS = new Set(['rhine', 'danube', 'elbe', 'loire', 'tagus', 'vistula', 'dnieper', 'ganges', 'indus', 'tigris', 'euphrates',
  'zambezi', 'orange', 'limpopo', 'rio-grande', 'colorado', 'saint-lawrence', 'murray', 'senegal', 'gambia']);

// ---------------------------------------------------------------- what to play
export interface Selection { kinds: string[]; places: string[]; size: number }
export const DEFAULT_KINDS = TEMPLATES.filter(t => t.cat !== 'neighbours').map(t => t.id);
/** The Daily: the same 10 questions for everyone on a day, from the main categories, untimed. */
export const DAILY: Selection = { kinds: DEFAULT_KINDS, places: [], size: 10 };

const placeTest = (sel: Selection) => {
  if (!sel.places.length) return () => true;
  const set = new Set(sel.places);
  return (c: string) => set.has(c);
};

/** How many different questions the selection can ask. */
export function available(kb: Knowledge, sel: Selection): number {
  const inPlace = placeTest(sel);
  return TEMPLATES.filter(t => sel.kinds.includes(t.id)).reduce((n, t) => n + t.subjects(kb, inPlace).length, 0);
}

const RECENT_KEY = 'gk-recent';
function recent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
export function remember(keys: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([...keys, ...recent()].slice(0, 120))); } catch { /* private mode */ }
}

/** A round of `size` questions. Categories take turns; within one, about 60% are well-known subjects. No country
 *  comes up twice, and questions seen recently rest unless there aren't enough others (`fresh`: ignore that). */
export function buildRound(kb: Knowledge, sel: Selection, rng: Rng = Math.random, fresh = false): Question[] {
  const inPlace = placeTest(sel);
  const templates = TEMPLATES.filter(t => sel.kinds.includes(t.id));
  const queues = new Map<Template, string[]>();
  for (const t of templates) {
    const all = shuffle(t.subjects(kb, inPlace), rng);
    const core = all.filter(id => t.core(kb, id)), other = all.filter(id => !t.core(kb, id));
    const order: string[] = [];
    while (core.length || other.length) order.push(((core.length && (!other.length || rng() < 0.6)) ? core : other).shift()!);
    queues.set(t, order);
  }
  const cats = shuffle([...new Set(templates.map(t => t.cat))], rng);
  const seen = new Set(fresh ? [] : recent());
  const round: Question[] = [];
  const used = new Set<string>();
  for (const pass of [true, false]) { // the first pass rests recently seen questions, the second fills up
    let stuck = 0;
    for (let i = 0; round.length < sel.size && stuck < cats.length; i++) {
      const cat = cats[i % cats.length];
      let q: Question | null = null;
      for (const t of shuffle(templates.filter(t => t.cat === cat), rng)) {
        const queue = queues.get(t)!;
        for (let j = 0; j < queue.length && !q; j++) {
          const made = t.make(kb, queue[j], rng);
          const cand: Question | null = made && { ...made, cat: t.cat };
          if (!cand || round.some(r => r.key === cand.key) || cand.countries.some(c => used.has(c)) || (pass && seen.has(cand.key))) continue;
          queue.splice(j, 1);
          q = cand;
        }
        if (q) break;
      }
      if (!q) { stuck++; continue; }
      stuck = 0;
      round.push(q);
      q.countries.forEach(c => used.add(c));
    }
  }
  return round;
}

/** A seeded random generator (mulberry32), for the Daily. */
export function seeded(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

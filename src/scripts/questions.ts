// Question templates: each turns approved facts about one subject into a question. Nothing here is a fact itself;
// facts only come from the knowledge base. Prompts are short, plain sentences ("What is the capital of France?"),
// two small tags say what is given and what is asked (MAP → COUNTRY), and every question has one clue: a map, a flag,
// a text or a name, never two.
import type { Country, Knowledge, Language, Peak, River } from './kb';

export type Cat = 'locations' | 'capitals' | 'flags' | 'languages' | 'mountains' | 'rivers';
/** What a question shows (given) and what it asks for, as the two tags on the card. */
export type Tag = 'Map' | 'Country' | 'Capital' | 'Flag' | 'Text' | 'Language' | 'Highest point' | 'Mountain' | 'River' | 'Neighbour';
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
  subject: string;             // what the question is about (a country, language, peak or river id)
  cat: Cat;
  given: Tag;
  asked: Tag;
  format: 'type' | 'choice';
  prompt: string;
  clue: string;                // what was asked, short, for the answers list ("Flag", "Map", "Capital of France")
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
  code: string;                // one letter, for challenge links: never change it once links are out
  cat: Cat;
  label: string;               // in the menu: what you see → what you answer
  given: Tag;
  asked: Tag;
  subjects(kb: Knowledge, inPlace: (country: string) => boolean): string[];
  core(kb: Knowledge, id: string): boolean;
  // `cat`, `given`, `asked` and `subject` are filled in by buildRound. The answers never depend on what is selected
  // under Where: a question about France accepts every neighbour of France, also when only France is selected.
  make(kb: Knowledge, id: string, rng: Rng): Omit<Question, 'cat' | 'given' | 'asked' | 'subject'> | null;
}

export const CATS: { id: Cat; label: string }[] = [
  { id: 'locations', label: 'Locations' },
  { id: 'capitals', label: 'Capitals' },
  { id: 'flags', label: 'Flags' },
  { id: 'languages', label: 'Languages' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'rivers', label: 'Rivers' },
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
// Names that take "the" in a sentence: "the capital of the Netherlands".
const THE = new Set(['ARE', 'BHS', 'CAF', 'CIV', 'COG', 'COM', 'DOM', 'GBR', 'GMB', 'MDV', 'MHL', 'NLD', 'PHL', 'SLB', 'USA']);
export const theName = (kb: Knowledge, id: string) => `${THE.has(id) ? 'the ' : ''}${country(kb, id).name}`;
const upper = (s: string) => s[0].toUpperCase() + s.slice(1);
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
    id: 'loc.map', code: 'L', cat: 'locations', label: 'Map → country', given: 'Map', asked: 'Country',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    core: isCore,
    make: (kb, id) => {
      const c = country(kb, id);
      return { key: `map:${id}`, kind: 'loc.map', format: 'type', prompt: 'Which country is this?', clue: 'Map', media: { kind: 'map', country: id },
        pools: ['country'], accept: [id], answer: c.name, countries: [id] };
    },
  },
  {
    id: 'cap.name', code: 'C', cat: 'capitals', label: 'Country → capital', given: 'Country', asked: 'Capital',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.mainCapitals(c).length),
    core: isCore,
    make: (kb, id) => {
      const one = kb.mainCapitals(id).length === 1;
      const prompt = `What is ${one ? 'the' : 'a'} capital of ${theName(kb, id)}?`;
      return { key: `capital:${id}`, kind: 'cap.name', format: 'type', prompt, clue: `Capital of ${theName(kb, id)}`, media: { kind: 'none' },
        pools: ['city'], accept: kb.capitals(id), answer: kb.mainCapitals(id).map(x => kb.name(x)).join(' / '), countries: [id] };
    },
  },
  {
    id: 'cap.map', code: 'M', cat: 'capitals', label: 'Map → capital', given: 'Map', asked: 'Capital',
    // One capital with a checked position: the dot marks it.
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => { const m = kb.mainCapitals(c); return m.length === 1 && kb.cities.find(x => x.id === m[0])?.ll; }),
    core: isCore,
    make: (kb, id) => {
      const city = kb.cities.find(x => x.id === kb.mainCapitals(id)[0])!;
      return { key: `capital-map:${id}`, kind: 'cap.map', format: 'type', prompt: 'What is the capital of this country?', clue: `Map: ${country(kb, id).name}`,
        media: { kind: 'map', country: id, dot: city.ll }, pools: ['city'], accept: kb.capitals(id), answer: city.name, countries: [id] };
    },
  },
  {
    id: 'cap.reverse', code: 'R', cat: 'capitals', label: 'Capital → country', given: 'Capital', asked: 'Country',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.mainCapitals(c).length === 1),
    core: isCore,
    make: (kb, id) => {
      const city = kb.name(kb.mainCapitals(id)[0]);
      return { key: `capital-of:${id}`, kind: 'cap.reverse', format: 'type', prompt: `${city} is the capital of which country?`,
        clue: `${city} is the capital of`, media: { kind: 'none' },
        pools: ['country'], accept: [id], answer: country(kb, id).name, countries: [id] };
    },
  },
  {
    id: 'flag.name', code: 'F', cat: 'flags', label: 'Flag → country', given: 'Flag', asked: 'Country',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    core: isCore,
    make: (kb, id) => ({ key: `flag:${id}`, kind: 'flag.name', format: 'type', prompt: 'Which country’s flag is this?', clue: 'Flag',
      media: { kind: 'flag', country: id }, pools: ['country'], accept: [id], answer: country(kb, id).name, countries: [id] }),
  },
  {
    id: 'flag.pick', code: 'P', cat: 'flags', label: 'Country → flag', given: 'Country', asked: 'Flag',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    core: isCore,
    make: (kb, id, rng) => {
      const w = nearWeights(kb, id, 8, 3, 0.3);
      const wrong = weightedSample(new Map(kb.countries.filter(o => o.id !== id).map(o => [o.id, w(o.id)])), 3, rng);
      const c = country(kb, id);
      return { key: `flag-pick:${id}`, kind: 'flag.pick', format: 'choice', prompt: `Which is the flag of ${theName(kb, id)}?`,
        clue: `Flag of ${theName(kb, id)}`, media: { kind: 'none' },
        pools: ['country'], accept: [id], answer: c.name, countries: [id],
        choices: shuffle([id, ...wrong], rng).map(x => ({ id: x, label: kb.name(x), flag: country(kb, x).flag })) };
    },
  },
  {
    id: 'lang.text', code: 'T', cat: 'languages', label: 'Text → language or country', given: 'Text', asked: 'Language',
    // Spoken in a selected country (officially or by many people).
    subjects: (kb, inPlace) => kb.languages.filter(l => l.sample && kb.cluster(l.id).some(x => kb.whereSpoken(x).some(inPlace))).map(l => l.id),
    core: (kb, id) => kb.whereSpoken(id, false).some(c => isCore(kb, c)),
    make: (kb, id) => {
      const l = kb.get<Language>(id)!;
      const family = kb.cluster(id);
      const where = [...new Set(family.flatMap(x => kb.whereSpoken(x)))];
      return { key: `text:${id}`, kind: 'lang.text', format: 'type', prompt: 'Which language is this?', clue: `“${l.sample}”`,
        media: { kind: 'text', text: l.sample!, lang: BCP47[id] ?? id }, pools: ['language', 'country'], accept: [...family, ...where],
        answer: l.name, countries: [] };
    },
  },
  {
    id: 'lang.official', code: 'O', cat: 'languages', label: 'Country → official language', given: 'Country', asked: 'Language',
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
      const prompt = `What is ${official.length > 1 ? 'an' : 'the'} official language of ${theName(kb, id)}?`;
      return { key: `language:${id}`, kind: 'lang.official', format: 'choice', prompt, clue: `Official language of ${theName(kb, id)}`, media: { kind: 'none' },
        pools: ['language'], accept: official, answer: kb.name(right), countries: [id],
        choices: shuffle([right, ...wrong], rng).map(x => ({ id: x, label: kb.name(x) })) };
    },
  },
  {
    id: 'peak.name', code: 'H', cat: 'mountains', label: 'Country → highest point', given: 'Country', asked: 'Highest point',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.highestPoint(c)),
    core: isCore,
    make: (kb, id, rng) => {
      const right = kb.highestPoint(id)!;
      const w = nearWeights(kb, id);
      const weight = new Map<string, number>();
      for (const p of kb.peaks) if (p.id !== right) weight.set(p.id, Math.max(...kb.peakCountries(p.id).map(w)));
      return { key: `peak:${id}`, kind: 'peak.name', format: 'choice', prompt: `What is the highest point of ${theName(kb, id)}?`,
        clue: `Highest point of ${theName(kb, id)}`, media: { kind: 'none' },
        pools: ['peak'], accept: [right], answer: kb.name(right), countries: [id],
        choices: shuffle([right, ...weightedSample(weight, 3, rng)], rng).map(x => ({ id: x, label: kb.name(x) })) };
    },
  },
  {
    id: 'peak.map', code: 'K', cat: 'mountains', label: 'Highest point → country', given: 'Mountain', asked: 'Country',
    subjects: (kb, inPlace) => kb.peaks.filter(p => kb.peakCountries(p.id).some(inPlace)).map(p => p.id),
    core: (kb, id) => kb.peakCountries(id).some(c => isCore(kb, c)) || (kb.get<Peak>(id)?.m ?? 0) >= 5000,
    make: (kb, id) => {
      const p = kb.get<Peak>(id)!, where = kb.peakCountries(id);
      // Two countries' highest points can be a few km apart (Rysy and Gerlachovsky stit are 3 km apart): one
      // triangle can't tell them apart, so the neighbour whose highest point is that close counts as right too.
      const near = kb.peaks.filter(o => o.id !== id && km(o.ll, p.ll) < 25).flatMap(o => kb.peakCountries(o.id));
      return { key: `peak-map:${id}`, kind: 'peak.map', format: 'type', prompt: 'Which country has its highest point here?', clue: `${p.name} is the highest point of`,
        media: { kind: 'map', peak: p.ll }, pools: ['country'], accept: [...new Set([...where, ...near])], answer: where.map(c => kb.name(c)).join(' / '),
        reveal: where, countries: where };
    },
  },
  {
    id: 'river.name', code: 'V', cat: 'rivers', label: 'River → name', given: 'Map', asked: 'River',
    subjects: (kb, inPlace) => kb.rivers.filter(r => kb.riverCountries(r.id).some(inPlace)).map(r => r.id),
    core: (kb, id) => (kb.get<River>(id)?.km ?? 0) >= 2500 || FAMOUS_RIVERS.has(id),
    make: (kb, id) => {
      const r = kb.get<River>(id)!;
      return { key: `river:${id}`, kind: 'river.name', format: 'type', prompt: 'Which river is this?', clue: `River in ${list(kb.riverCountries(id).map(c => kb.name(c)), 2)}`,
        media: { kind: 'map', river: id }, pools: ['river'], accept: kb.rivers.filter(x => x.name === r.name).map(x => x.id),
        answer: r.name, countries: [] };
    },
  },
  {
    id: 'river.map', code: 'W', cat: 'rivers', label: 'River → country', given: 'River', asked: 'Country',
    subjects: (kb, inPlace) => kb.rivers.filter(r => kb.riverCountries(r.id).some(inPlace)).map(r => r.id),
    core: (kb, id) => (kb.get<River>(id)?.km ?? 0) >= 2500 || FAMOUS_RIVERS.has(id),
    make: (kb, id) => {
      const shown = kb.riverCountries(id);
      return { key: `river-map:${id}`, kind: 'river.map', format: 'type', prompt: 'Name a country this river flows through.', clue: `${kb.name(id)} flows through`,
        media: { kind: 'map', river: id }, pools: ['country'], accept: kb.riverCountries(id, true),
        answer: list(shown.map(c => kb.name(c))), reveal: shown, countries: [] };
    },
  },
  {
    // Neighbours are a question type under Locations (on by default), not a category of their own.
    id: 'nb.name', code: 'N', cat: 'locations', label: 'Country → neighbour', given: 'Country', asked: 'Neighbour',
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.neighbours(c).length),
    core: isCore,
    make: (kb, id) => {
      const next = kb.neighbours(id); // all of them, whatever is selected under Where
      return { key: `neighbour:${id}`, kind: 'nb.name', format: 'type', prompt: `Name a country that borders ${theName(kb, id)}.`,
        clue: `${upper(theName(kb, id))} borders`, media: { kind: 'none' },
        pools: ['country'], accept: next, answer: list(next.map(c => kb.name(c))), countries: [id] };
    },
  },
];
const FAMOUS_RIVERS = new Set(['rhine', 'danube', 'elbe', 'loire', 'tagus', 'vistula', 'dnieper', 'ganges', 'indus', 'tigris', 'euphrates',
  'zambezi', 'orange', 'limpopo', 'rio-grande', 'colorado', 'saint-lawrence', 'murray', 'senegal', 'gambia']);

// ---------------------------------------------------------------- what to play
/** size 0 means every question the selection can ask: The Gordian Knot. */
export interface Selection { kinds: string[]; places: string[]; size: number }
export const DEFAULT_KINDS = TEMPLATES.map(t => t.id);
/** The Daily: the same 10 questions for everyone on a day, from every category. */
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

/** One question, made the same way every time for the same seed (its options are shuffled by that seed), so a
 *  challenge link can carry just the subjects. */
function makeQuestion(kb: Knowledge, t: Template, id: string, seed: string): Question | null {
  const made = t.make(kb, id, seeded(`${seed}|${t.id}|${id}`));
  return made && { ...made, cat: t.cat, given: t.given, asked: t.asked, subject: id };
}

/** A round of `size` questions (0: all of them). Categories take turns; within one, about 60% are well-known
 *  subjects. No country comes up twice (except when playing everything), and questions seen recently rest unless
 *  there aren't enough others (`fresh`: ignore that). `seed` fixes each question's options. */
export function buildRound(kb: Knowledge, sel: Selection, rng: Rng = Math.random, fresh = false, seed = String(rng())): Question[] {
  const all = sel.size <= 0;
  const size = all ? Infinity : sel.size;
  if (all) fresh = true;
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
  const keys = new Set<string>();
  for (const pass of [true, false]) { // the first pass rests recently seen questions, the second fills up
    let stuck = 0;
    for (let i = 0; round.length < size && stuck < cats.length; i++) {
      const cat = cats[i % cats.length];
      let q: Question | null = null;
      for (const t of shuffle(templates.filter(t => t.cat === cat), rng)) {
        const queue = queues.get(t)!;
        for (let j = 0; j < queue.length && !q; j++) {
          const id = queue[j];
          const cand = makeQuestion(kb, t, id, seed);
          if (!cand || keys.has(cand.key) || (!all && cand.countries.some(c => used.has(c))) || (pass && seen.has(cand.key))) continue;
          queue.splice(j, 1);
          q = cand;
        }
        if (q) break;
      }
      if (!q) { stuck++; continue; }
      stuck = 0;
      round.push(q);
      keys.add(q.key);
      q.countries.forEach(c => used.add(c));
    }
  }
  return round;
}

/** The same questions again, from their codes and subjects (a challenge link). Subjects the data no longer has are
 *  left out. */
export function rebuildRound(kb: Knowledge, items: { code: string; subject: string }[], seed: string): Question[] {
  const out: Question[] = [];
  for (const it of items) {
    const t = TEMPLATES.find(x => x.code === it.code);
    if (!t) continue;
    try { const q = makeQuestion(kb, t, it.subject, seed); if (q) out.push(q); } catch { /* gone from the data */ }
  }
  return out;
}
export const codeOf = (kind: string) => TEMPLATES.find(t => t.id === kind)?.code ?? '';

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
